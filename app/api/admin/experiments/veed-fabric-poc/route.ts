import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadBufferToR2 } from "@/lib/r2";
import { submitFabric, pollFabric } from "@/lib/veed-fabric-client";

/**
 * EXPERIMENTAL — T-1151 VEED Fabric 1.0 podcast E2E. NOT a product feature, no UI.
 * Admin-gated, step-driven (serverless-timeout safe). Reuses the isolated Fabric
 * client, the EXISTING `podcast_segment_lipsync_clips` cache table, and the EXISTING
 * Modal `render_podcast` premium compositor (which reads ready clips by segment +
 * current audio, provider-agnostic — so it consumes Fabric clips unchanged).
 *
 * Single-speaker POC steps (kept):
 *  - "create" / "poll": one image_url + audio_url -> talking clip -> R2.
 * Podcast E2E steps (added):
 *  - "plan":  { podcastId, images:{host,guest} } -> spoken seconds + $ estimate (no spend).
 *  - "submit": one Fabric job per ready segment (active speaker image + segment audio),
 *             written to the cache table (provider='veed_fabric'); skips segments that
 *             already have a ready clip for the current audio (cache/resume). Hard cap $8.
 *  - "poll_podcast": advance processing Fabric rows -> download to R2 -> status=ready.
 */
export const maxDuration = 60;

const FABRIC_RATE_480P = 0.08; // $/s
const COST_CAP = 8; // $ hard cap for the whole E2E
const CACHE_KEY = "veedfabric-480p";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const step = body.step;
  const t0 = Date.now();
  try {
    // ---- single-speaker POC (kept) ----
    if (step === "create") {
      const { imageUrl, audioUrl, resolution } = body;
      if (!imageUrl || !audioUrl) return NextResponse.json({ error: "imageUrl + audioUrl required" }, { status: 400 });
      const r = await submitFabric({ imageUrl, audioUrl, resolution: resolution === "720p" ? "720p" : "480p" });
      return NextResponse.json({ submitMs: Date.now() - t0, http: r.http, requestId: r.requestId, raw: r.raw });
    }
    if (step === "poll") {
      if (!body.requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });
      const s = await pollFabric(String(body.requestId));
      if (!s.videoUrl) return NextResponse.json({ elapsedMs: Date.now() - t0, http: s.http, status: s.status, ready: false, raw: s.raw });
      const dl = await fetch(s.videoUrl, { signal: AbortSignal.timeout(120_000) });
      if (!dl.ok) return NextResponse.json({ elapsedMs: Date.now() - t0, ready: true, providerUrl: s.videoUrl, error: `download ${dl.status}` });
      const buf = Buffer.from(await dl.arrayBuffer());
      const r2 = await uploadBufferToR2(buf, `experiments/veed-fabric-poc/${body.requestId}.mp4`, "video/mp4");
      return NextResponse.json({ elapsedMs: Date.now() - t0, ready: true, providerUrl: s.videoUrl, r2Url: r2, bytes: buf.length });
    }

    // ---- podcast E2E ----
    const service = createServiceClient();
    const podcastId: string | undefined = body.podcastId;
    const images: Record<string, string> = (body.images && typeof body.images === "object") ? body.images : {};

    if (step === "plan" || step === "submit" || step === "poll_podcast") {
      if (!podcastId) return NextResponse.json({ error: "podcastId required" }, { status: 400 });
    }

    if (step === "plan" || step === "submit") {
      const { data: speakers } = await service.from("podcast_speakers").select("id,role,persona_id").eq("podcast_id", podcastId);
      const roleBy = new Map((speakers || []).map((s) => [s.id, s.role as string]));
      const personaBy = new Map((speakers || []).map((s) => [s.id, s.persona_id as string | null]));
      const { data: segments } = await service
        .from("podcast_segments").select("id,speaker_id,order_index,audio_url,start_ms,end_ms,status")
        .eq("podcast_id", podcastId).order("order_index", { ascending: true });
      const ready = (segments || []).filter((s) => s.status === "ready" && s.audio_url);
      const secondsFor = (s: { start_ms: number | null; end_ms: number | null }) =>
        (typeof s.start_ms === "number" && typeof s.end_ms === "number" && s.end_ms > s.start_ms) ? (s.end_ms - s.start_ms) / 1000 : 0;
      const spoken = ready.reduce((a, s) => a + secondsFor(s), 0);

      if (step === "plan") {
        return NextResponse.json({
          segments: ready.length,
          spokenSeconds: Math.round(spoken * 10) / 10,
          theoreticalCostUsd: Math.round(spoken * FABRIC_RATE_480P * 100) / 100,
          capUsd: COST_CAP,
          overCap: spoken * FABRIC_RATE_480P > COST_CAP,
        });
      }

      // step === "submit"
      if (spoken * FABRIC_RATE_480P > COST_CAP) {
        return NextResponse.json({ error: `theoretical cost $${(spoken * FABRIC_RATE_480P).toFixed(2)} exceeds cap $${COST_CAP}` }, { status: 400 });
      }
      let submitted = 0, cached = 0, skipped = 0, spend = 0;
      const skippedReasons: string[] = [];
      for (const seg of ready) {
        const role = roleBy.get(seg.speaker_id) || "";
        const image = images[role];
        if (!image) { skipped++; skippedReasons.push(`${seg.order_index}:no_image_for_${role}`); continue; }
        const { data: existing } = await service
          .from("podcast_segment_lipsync_clips")
          .select("id,status,video_url,audio_url")
          .eq("segment_id", seg.id).eq("cache_key", CACHE_KEY).maybeSingle();
        if (existing?.status === "ready" && existing.video_url && existing.audio_url === seg.audio_url) { cached++; continue; }
        const dur = secondsFor(seg);
        if (spend + dur * FABRIC_RATE_480P > COST_CAP) { skipped++; skippedReasons.push(`${seg.order_index}:over_cap`); continue; }
        const sub = await submitFabric({ imageUrl: image, audioUrl: seg.audio_url as string, resolution: "480p" });
        const row = {
          podcast_id: podcastId, segment_id: seg.id, speaker_id: seg.speaker_id,
          persona_id: personaBy.get(seg.speaker_id) ?? null, base_clip_id: null,
          audio_url: seg.audio_url, cache_key: CACHE_KEY, mode: "precision", provider: "veed_fabric",
          provider_task_id: sub.requestId, video_url: null, storage_key: null,
          duration_seconds: Math.round(dur * 100) / 100, credits_usd: Math.round(dur * FABRIC_RATE_480P * 100) / 100,
          status: sub.requestId ? "processing" : "failed",
          error_message: sub.requestId ? null : JSON.stringify(sub.raw).slice(0, 400),
          updated_at: new Date().toISOString(),
        };
        if (existing?.id) await service.from("podcast_segment_lipsync_clips").update(row).eq("id", existing.id);
        else await service.from("podcast_segment_lipsync_clips").insert(row);
        if (sub.requestId) { submitted++; spend += dur * FABRIC_RATE_480P; }
        else { skipped++; skippedReasons.push(`${seg.order_index}:submit_failed`); }
      }
      return NextResponse.json({ submitted, cached, skipped, actualSpendUsd: Math.round(spend * 100) / 100, skippedReasons });
    }

    if (step === "poll_podcast") {
      const { data: rows } = await service
        .from("podcast_segment_lipsync_clips")
        .select("id,provider_task_id,status")
        .eq("podcast_id", podcastId).eq("provider", "veed_fabric").eq("status", "processing");
      let ready = 0, processing = 0, failed = 0;
      for (const r of rows || []) {
        if (!r.provider_task_id) { failed++; continue; }
        try {
          const s = await pollFabric(r.provider_task_id);
          if (s.videoUrl) {
            const dl = await fetch(s.videoUrl, { signal: AbortSignal.timeout(90_000) });
            if (!dl.ok) throw new Error(`download ${dl.status}`);
            const buf = Buffer.from(await dl.arrayBuffer());
            const key = `podcast/lipsync/${podcastId}/${r.id}.mp4`;
            const url = await uploadBufferToR2(buf, key, "video/mp4");
            await service.from("podcast_segment_lipsync_clips")
              .update({ status: "ready", video_url: url, storage_key: key, updated_at: new Date().toISOString() })
              .eq("id", r.id);
            ready++;
          } else if (s.status && /FAIL|ERROR|CANCEL/i.test(s.status)) {
            await service.from("podcast_segment_lipsync_clips")
              .update({ status: "failed", error_message: JSON.stringify(s.raw).slice(0, 400), updated_at: new Date().toISOString() })
              .eq("id", r.id);
            failed++;
          } else { processing++; }
        } catch (e) {
          await service.from("podcast_segment_lipsync_clips")
            .update({ status: "failed", error_message: (e instanceof Error ? e.message : String(e)).slice(0, 400), updated_at: new Date().toISOString() })
            .eq("id", r.id);
          failed++;
        }
      }
      return NextResponse.json({ ready, processing, failed });
    }

    return NextResponse.json({ error: "unknown step (create|poll|plan|submit|poll_podcast)" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
