import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { generateVoiceover, isTTSAvailable } from "@/lib/tts";
import { uploadBufferToR2 } from "@/lib/r2";
import { resolveSpeakerVoices, estimateSegmentTimings } from "@/lib/podcast/voices";

// Sequential TTS over up to 10 segments can take ~10-30s. Stay on the serverless
// path for V1 (no Modal); cap segments to keep within this budget.
export const maxDuration = 60;

const MAX_SEGMENTS = 10;

interface SegmentRow {
  id: string;
  podcast_id: string;
  speaker_id: string;
  order_index: number;
  text: string;
  audio_url: string | null;
  start_ms: number | null;
  end_ms: number | null;
  status: string;
}

/** Word-count duration estimate (seconds), matching lib/tts.ts heuristic. */
function estimateDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (words / 150) * 60;
}

/** Synthesize one segment with a single retry. Returns audio + duration. */
async function synthesizeWithRetry(text: string, voice: string) {
  try {
    return await generateVoiceover({ text, voice, format: "mp3" });
  } catch {
    return await generateVoiceover({ text, voice, format: "mp3" }); // one retry
  }
}

/**
 * POST /api/podcasts/[id]/tts — generate per-segment multi-speaker audio.
 * No video render, no lip-sync. Provider is never exposed in the response.
 *
 * Body: { preview?: <segment_id>, force?: boolean }
 *  - preview: synthesize ONLY that one segment (cheap audition).
 *  - force:   re-synthesize segments that already have audio (default: skip ready).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const service = createServiceClient();

    const { data: podcast } = await service.from("podcasts").select("*").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!isTTSAvailable()) {
      return NextResponse.json({ error: "Voice synthesis is unavailable" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const previewId: string | undefined = typeof body.preview === "string" ? body.preview : undefined;
    const force = body.force === true;

    const { data: speakers } = await service
      .from("podcast_speakers")
      .select("id, role, voice_id")
      .eq("podcast_id", id);
    // Require both speakers — never synthesize with a silent/default-only cast.
    const hasHost = (speakers || []).some((s) => s.role === "host");
    const hasGuest = (speakers || []).some((s) => s.role === "guest");
    if (!hasHost || !hasGuest) {
      return NextResponse.json({ error: "Podcast is missing its speakers" }, { status: 500 });
    }
    const voiceBySpeaker = resolveSpeakerVoices(speakers || []);

    const { data: segmentsData } = await service
      .from("podcast_segments")
      .select("*")
      .eq("podcast_id", id)
      .order("order_index", { ascending: true });
    const segments = (segmentsData || []) as SegmentRow[];

    if (segments.length === 0) {
      return NextResponse.json({ error: "This podcast has no dialogue segments yet" }, { status: 400 });
    }
    if (segments.length > MAX_SEGMENTS) {
      return NextResponse.json({ error: `Too many segments (max ${MAX_SEGMENTS})` }, { status: 400 });
    }

    let ready = 0;
    let failed = 0;
    let skipped = 0;

    // New/regenerated audio makes any previously rendered MP4 stale — reset the
    // render state so an old video can never stay attached to changed audio.
    const invalidateRender = async () => {
      await service
        .from("podcasts")
        .update({ video_url: null, render_status: "idle", render_error: null })
        .eq("id", id);
    };

    const synthOne = async (seg: SegmentRow): Promise<SegmentRow> => {
      const voice = voiceBySpeaker[seg.speaker_id] || undefined;
      try {
        const tts = await synthesizeWithRetry(seg.text, voice as string);
        // Unique key per generation so `force` never serves a cached older audio.
        const url = await uploadBufferToR2(
          Buffer.from(tts.audio),
          `audio/podcast/${id}/${seg.id}-${randomUUID()}.mp3`,
          "audio/mpeg",
        );
        ready++;
        return { ...seg, audio_url: url, status: "ready" };
      } catch (e) {
        console.error(`[podcast/tts] segment ${seg.id} failed:`, e instanceof Error ? e.message : e);
        failed++;
        // Non-destructive: keep any prior audio_url; only flag the status.
        return { ...seg, status: "failed" };
      }
    };

    // ── Preview: a single segment, no global retiming ──────────────────────
    if (previewId) {
      const seg = segments.find((s) => s.id === previewId);
      if (!seg) return NextResponse.json({ error: "Segment not found" }, { status: 404 });
      const updated = await synthOne(seg);
      const { error: upErr } = await service
        .from("podcast_segments")
        .update({ audio_url: updated.audio_url, status: updated.status })
        .eq("id", seg.id);
      if (upErr) {
        console.error(`[podcast/tts] preview update failed for ${seg.id}:`, upErr);
        return NextResponse.json({ error: "Could not save the generated audio" }, { status: 500 });
      }
      if (ready > 0) await invalidateRender();
      return NextResponse.json({
        ready,
        failed,
        skipped,
        segments: [publicSegment(updated)],
      });
    }

    // ── Full mode: generate missing/failed (or all if force), then retime ──
    const results: SegmentRow[] = [];
    for (const seg of segments) {
      const alreadyDone = seg.status === "ready" && !!seg.audio_url;
      if (alreadyDone && !force) {
        skipped++;
        results.push(seg);
        continue;
      }
      results.push(await synthOne(seg));
    }

    // Provisional timeline over ALL segments (cheap, no extra cost). Prefer the
    // existing duration when a segment was skipped, else estimate from text.
    const durations = results.map((s) => {
      if (s.start_ms != null && s.end_ms != null && s.status === "ready" && s.audio_url) {
        return Math.max(0, (s.end_ms - s.start_ms) / 1000);
      }
      return estimateDurationSec(s.text);
    });
    const timings = estimateSegmentTimings(durations);

    for (let i = 0; i < results.length; i++) {
      const s = results[i];
      const t = timings[i];
      const { error: upErr } = await service
        .from("podcast_segments")
        .update({
          audio_url: s.audio_url, // unchanged for skipped/failed-with-prior-audio
          status: s.status,
          start_ms: t.start_ms,
          end_ms: t.end_ms,
        })
        .eq("id", s.id);
      if (upErr) {
        // DB save failed → don't report this segment as successfully saved.
        console.error(`[podcast/tts] update failed for ${s.id}:`, upErr);
        if (s.status === "ready") {
          ready--;
          failed++;
        }
        s.status = "failed";
      }
      s.start_ms = t.start_ms;
      s.end_ms = t.end_ms;
    }

    // Only invalidate when audio actually changed (skip if everything was skipped).
    if (ready > 0) await invalidateRender();

    return NextResponse.json({
      ready,
      failed,
      skipped,
      segments: results.map(publicSegment),
    });
  } catch (err) {
    console.error("POST /api/podcasts/[id]/tts:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Shape returned to the client — never includes the TTS provider. */
function publicSegment(s: SegmentRow) {
  return {
    id: s.id,
    order_index: s.order_index,
    status: s.status,
    audio_url: s.audio_url,
    start_ms: s.start_ms,
    end_ms: s.end_ms,
  };
}
