import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { generateVoiceover, isTTSAvailable } from "@/lib/tts";
import { uploadBufferToR2 } from "@/lib/r2";
import { isPodcastVoice, VOICE_PREVIEW_TEXT } from "@/lib/podcast/voice-catalog";

export const maxDuration = 30;

/**
 * POST /api/podcasts/[id]/voice-preview
 * Synthesize a short, fixed sample line for a catalog voice so the user can
 * audition it BEFORE generating the whole podcast. Cached in R2 per voice id, so
 * repeat previews are free. The TTS provider is never exposed in the response.
 *
 * Body: { voice_id: string }
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
    const { data: podcast } = await service.from("podcasts").select("id, user_id").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!isTTSAvailable()) {
      return NextResponse.json({ error: "Voice preview is unavailable" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const voiceId = body.voice_id;
    if (!isPodcastVoice(voiceId)) {
      return NextResponse.json({ error: "Unknown voice" }, { status: 400 });
    }

    // Cache key is per-voice (not per-podcast) so previews are reused everywhere.
    const key = `audio/podcast/voice-previews/${voiceId}.mp3`;
    const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    const cachedUrl = publicBase ? `${publicBase}/${key}` : null;

    // Reuse the cached preview if it already exists.
    if (cachedUrl) {
      try {
        const head = await fetch(cachedUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        if (head.ok) {
          return NextResponse.json({ voice_id: voiceId, audio_url: cachedUrl, cached: true });
        }
      } catch {
        // HEAD failed/timed out → fall through and (re)generate.
      }
    }

    let audioUrl: string;
    try {
      const tts = await generateVoiceover({ text: VOICE_PREVIEW_TEXT, voice: voiceId, format: "mp3" });
      audioUrl = await uploadBufferToR2(Buffer.from(tts.audio), key, "audio/mpeg");
    } catch (e) {
      console.error(`[podcast/voice-preview] failed for ${voiceId}:`, e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Could not generate the voice preview" }, { status: 502 });
    }

    return NextResponse.json({ voice_id: voiceId, audio_url: audioUrl, cached: false });
  } catch (err) {
    console.error("POST /api/podcasts/[id]/voice-preview:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
