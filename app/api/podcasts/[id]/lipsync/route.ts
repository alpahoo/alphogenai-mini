import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import {
  estimateProviderLipsyncUsd,
  getPodcastLipsyncProvider,
  isPodcastLipsyncProviderId,
  providerSupportsInputSeconds,
} from "@/lib/podcast/lipsync-provider";
import { resolvePodcastLipsyncRoutingPlan } from "@/lib/podcast/lipsync-routing";
import { isPodcastBalancedBetaEligible } from "@/lib/podcast/lipsync-beta";
import { resolveUserPlan } from "@/lib/jobs/guard";
import { uploadBufferToR2 } from "@/lib/r2";
import { trimLipsyncBaseClip } from "@/lib/modal-client";
import {
  LIPSYNC_MAX_USD_PER_RENDER,
  lipsyncCacheKey,
  planLipsyncTrim,
  secondsFromText,
} from "@/lib/podcast/lipsync-estimate";

/**
 * POST /api/podcasts/[id]/lipsync — T-1144b Phase 1 (capped, cached, fallback-safe).
 *
 * Next orchestrates the selected provider; Modal only composites the cached
 * clips later. This route can spend real provider/GPU budget, so it is hard-capped at
 * LIPSYNC_MAX_USD_PER_RENDER: segments are lip-synced greedily in order until the
 * cap is reached; the rest are left for the talking_visual fallback. Cache hits
 * (same audio + base clip + mode) never re-spend.
 *
 * Body: { action: "start" | "poll" }.  "start" creates/reuses per-segment jobs;
 * "poll" advances processing jobs → ready (upload to R2) or failed. The client
 * polls until nothing is processing, then triggers the premium render.
 */
export const maxDuration = 60;

interface BaseClip {
  id: string;
  url: string;
  seconds: number;
}

/** Resolve a speaker's ready 1:1/720p base clip (mirrors the Modal resolver). */
async function resolveBaseClip(
  service: ReturnType<typeof createServiceClient>,
  personaId: string | null | undefined,
  ownerId: string,
): Promise<BaseClip | null> {
  if (!personaId) return null;
  // Visibility: persona must be the owner's or an active catalog persona.
  const { data: persona } = await service
    .from("podcast_personas")
    .select("user_id,status")
    .eq("id", personaId)
    .maybeSingle();
  if (!persona) return null;
  const visible = persona.user_id === ownerId || (persona.user_id === null && persona.status === "active");
  if (!visible) return null;

  const { data: clip } = await service
    .from("podcast_persona_base_clips")
    .select("id,video_url,duration_seconds")
    .eq("persona_id", personaId)
    .eq("provider", "heygen")
    .eq("aspect_ratio", "1:1")
    .eq("resolution", "720p")
    .eq("clip_kind", "talking_head")
    .eq("prompt_version", "base-v2-8s")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!clip?.video_url || !clip.duration_seconds) return null;
  return { id: clip.id, url: clip.video_url, seconds: Number(clip.duration_seconds) };
}

function segmentSeconds(seg: { start_ms: number | null; end_ms: number | null; text: string }): number {
  if (typeof seg.start_ms === "number" && typeof seg.end_ms === "number" && seg.end_ms > seg.start_ms) {
    return (seg.end_ms - seg.start_ms) / 1000;
  }
  return secondsFromText(seg.text);
}

type SegmentLipsyncStatus = "needs_voice" | "missing" | "processing" | "ready" | "failed";

interface SegmentSnapshot {
  segment_id: string;
  status: SegmentLipsyncStatus;
  error_message?: string | null;
}

interface CleanupResult {
  removed: number;
  scanned: number;
}

function logProviderEvent(event: string, details: Record<string, unknown>): void {
  console.info(JSON.stringify({ scope: "podcast_lipsync", event, ...details }));
}

async function startHeygenFallback(
  service: ReturnType<typeof createServiceClient>,
  podcastId: string,
  row: {
    id: string;
    segment_id: string;
    audio_url: string;
    base_clip_id: string;
    cache_key: string;
    mode: string | null;
    duration_seconds: number | null;
  },
  reason: string,
): Promise<void> {
  const { data: base } = await service
    .from("podcast_persona_base_clips")
    .select("video_url,duration_seconds")
    .eq("id", row.base_clip_id)
    .maybeSingle();
  const duration = Number(row.duration_seconds || 0);
  const baseDuration = Number(base?.duration_seconds || 0);
  if (!base?.video_url || !(duration > 0) || !(baseDuration > 0)) {
    throw new Error("Fallback base clip is unavailable");
  }
  const trim = planLipsyncTrim(duration, baseDuration);
  if (!trim.ok) throw new Error("Fallback duration is outside the supported range");
  const videoUrl = trim.endTimeSeconds
    ? await trimLipsyncBaseClip({
        podcastId,
        segmentId: row.segment_id,
        baseUrl: base.video_url,
        durationSeconds: duration,
        cacheKey: `${row.cache_key}-fallback`,
      })
    : base.video_url;
  const fallback = getPodcastLipsyncProvider("heygen");
  const mode = row.mode === "speed" ? "speed" : "precision";
  const task = await fallback.createClip({ videoUrl, audioUrl: row.audio_url, mode });
  const { error } = await service
    .from("podcast_segment_lipsync_clips")
    .update({
      provider: fallback.id,
      provider_task_id: task.providerTaskId,
      credits_usd: Math.round(estimateProviderLipsyncUsd(fallback, duration) * 100) / 100,
      status: "processing",
      error_message: `automatic fallback: ${reason}`.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw error;
  logProviderEvent("fallback_started", {
    podcastId,
    segmentId: row.segment_id,
    fromProvider: "latentsync_modal",
    toProvider: fallback.id,
    reason,
  });
}

/**
 * Keep the newest ready clip per provider matching each segment's current
 * audio. Provider caches must coexist so switching Balanced/Premium never
 * deletes the other tier or forces needless re-spend.
 */
async function cleanupStaleLipsyncRows(
  service: ReturnType<typeof createServiceClient>,
  podcastId: string,
): Promise<CleanupResult> {
  const { data: segs } = await service
    .from("podcast_segments")
    .select("id,audio_url")
    .eq("podcast_id", podcastId);
  const curAudio = new Map<string, string | null>((segs || []).map((s) => [s.id, s.audio_url]));
  const { data: rows } = await service
    .from("podcast_segment_lipsync_clips")
      .select("id,segment_id,audio_url,status,video_url,provider,updated_at")
    .eq("podcast_id", podcastId)
    .in("status", ["ready", "failed"]);

  const bySeg = new Map<string, NonNullable<typeof rows>>();
  for (const r of rows || []) {
    const arr = bySeg.get(r.segment_id) || [];
    arr.push(r);
    bySeg.set(r.segment_id, arr);
  }

  const removeIds: string[] = [];
  for (const [segId, segRows] of bySeg) {
    const cur = curAudio.get(segId) ?? "__none__";
    const keepIds = new Set<string>();
    const byProvider = new Map<string, typeof segRows>();
    for (const row of segRows || []) {
      if (row.status !== "ready" || !row.video_url || row.audio_url !== cur) continue;
      const provider = row.provider || "heygen";
      const providerRows = byProvider.get(provider) || [];
      providerRows.push(row);
      byProvider.set(provider, providerRows);
    }
    for (const providerRows of byProvider.values()) {
      const newest = providerRows
        .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
      if (newest?.id) keepIds.add(newest.id);
    }
    for (const r of segRows || []) {
      if (!keepIds.has(r.id)) removeIds.push(r.id);
    }
  }

  if (removeIds.length > 0) {
    const { error } = await service
      .from("podcast_segment_lipsync_clips")
      .update({ status: "removed", updated_at: new Date().toISOString() })
      .in("id", removeIds);
    if (error) throw error;
  }

  return { removed: removeIds.length, scanned: (rows || []).length };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const service = createServiceClient();
    const body = await request.json().catch(() => ({}));
    const action = body.action === "poll" ? "poll" : body.action === "cleanup" ? "cleanup" : "start";

    const { data: podcast } = await service.from("podcasts").select("id,user_id,metadata").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ownerId = podcast.user_id as string;
    const metadata = podcast.metadata && typeof podcast.metadata === "object"
      ? podcast.metadata as Record<string, unknown>
      : {};
    let balancedCohortEligible = false;
    if (metadata.lipsync_quality_mode === "balanced") {
      const plan = await resolveUserPlan(service, user.id);
      balancedCohortEligible = isPodcastBalancedBetaEligible({ email: user.email, plan });
    }
    const routing = resolvePodcastLipsyncRoutingPlan({
      qualityMode: metadata.lipsync_quality_mode,
      balancedCohortEligible,
    });
    const mode = routing.providerMode;
    const startProvider = getPodcastLipsyncProvider(routing.providerId);

    if (action === "cleanup") {
      // T-1146 stale purge: keep latest per segment, soft-delete stale rows.
      try {
        const cleanup = await cleanupStaleLipsyncRows(service, id);
        return NextResponse.json({ action, ...cleanup });
      } catch (error) {
        console.error("lipsync cleanup failed:", error);
        return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
      }
    }

    if (action === "poll") {
      const { data: rows } = await service
        .from("podcast_segment_lipsync_clips")
        .select("id,provider,provider_task_id,status,segment_id,audio_url,base_clip_id,cache_key,mode,duration_seconds")
        .eq("podcast_id", id)
        .eq("status", "processing");
      let ready = 0, failed = 0, processing = 0, fallbacks = 0;
      let completedWithTelemetry = 0, totalElapsedSeconds = 0, totalOutputSeconds = 0;
      for (const row of rows || []) {
        if (!row.provider_task_id) { processing++; continue; }
        try {
          const taskProvider = row.provider == null
            ? getPodcastLipsyncProvider()
            : isPodcastLipsyncProviderId(row.provider)
              ? getPodcastLipsyncProvider(row.provider)
              : null;
          if (!taskProvider) throw new Error("Unsupported sync provider for cached task");
          const r = await taskProvider.pollClip(row.provider_task_id);
          if (r.status === "completed" && r.videoUrl) {
            // Persist the HeyGen output to our own R2 so the cache is durable.
            const dl = await fetch(r.videoUrl, { signal: AbortSignal.timeout(45_000) });
            if (!dl.ok) throw new Error(`download ${dl.status}`);
            const buf = Buffer.from(await dl.arrayBuffer());
            const key = `podcast/lipsync/${id}/${row.id}.mp4`;
            const url = await uploadBufferToR2(buf, key, "video/mp4");
            await service.from("podcast_segment_lipsync_clips")
              .update({ status: "ready", video_url: url, storage_key: key, updated_at: new Date().toISOString() })
              .eq("id", row.id);
            if (r.metrics) {
              completedWithTelemetry++;
              totalElapsedSeconds += r.metrics.elapsedSeconds || 0;
              totalOutputSeconds += r.metrics.outputDurationSeconds || 0;
            }
            logProviderEvent("task_completed", {
              podcastId: id,
              segmentId: row.segment_id,
              provider: taskProvider.id,
              elapsedSeconds: r.metrics?.elapsedSeconds,
              outputDurationSeconds: r.metrics?.outputDurationSeconds,
              gpu: r.metrics?.gpu,
            });
            ready++;
          } else if (r.status === "failed" && taskProvider.id !== "heygen") {
            await startHeygenFallback(service, id, row, r.error || "provider task failed");
            fallbacks++;
            processing++;
          } else if (r.status === "failed") {
            await service.from("podcast_segment_lipsync_clips")
              .update({ status: "failed", error_message: (r.error || "lipsync failed").slice(0, 500), updated_at: new Date().toISOString() })
              .eq("id", row.id);
            failed++;
          } else {
            processing++;
          }
        } catch (e) {
          if (row.provider === "latentsync_modal") {
            try {
              const reason = e instanceof Error ? e.message : String(e);
              await startHeygenFallback(service, id, row, reason);
              fallbacks++;
              processing++;
              continue;
            } catch (fallbackError) {
              e = fallbackError;
            }
          }
          await service.from("podcast_segment_lipsync_clips")
            .update({ status: "failed", error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500), updated_at: new Date().toISOString() })
            .eq("id", row.id);
          failed++;
        }
      }
      let cleanup: CleanupResult | null = null;
      if (processing === 0) {
        try {
          cleanup = await cleanupStaleLipsyncRows(service, id);
        } catch (error) {
          // Automatic cleanup is table-hygiene only. Do not fail a completed
          // lip-sync poll just because stale-row pruning had a transient DB issue.
          console.warn("automatic lipsync cleanup failed:", error);
        }
      }
      return NextResponse.json({
        action,
        ready,
        failed,
        processing,
        fallbacks,
        cleanup,
        metrics: {
          completedWithTelemetry,
          totalElapsedSeconds: Math.round(totalElapsedSeconds * 100) / 100,
          totalOutputSeconds: Math.round(totalOutputSeconds * 100) / 100,
        },
      });
    }

    // ---- action === "start" ----
    const { data: speakers } = await service
      .from("podcast_speakers").select("id,role,persona_id").eq("podcast_id", id);
    const { data: segments } = await service
      .from("podcast_segments")
      .select("id,speaker_id,order_index,text,audio_url,start_ms,end_ms,status")
      .eq("podcast_id", id)
      .order("order_index", { ascending: true });

    // Optional partial selection (T-1144b): lip-sync only these segment ids.
    // Enables targeted regenerate + controlled/low-spend QA. Omitted → all ready.
    const segmentIds: string[] | null = Array.isArray(body.segmentIds)
      ? body.segmentIds.filter((x: unknown) => typeof x === "string")
      : null;
    let readySegs = (segments || []).filter((s) => s.status === "ready" && s.audio_url);
    if (segmentIds && segmentIds.length > 0) {
      readySegs = readySegs.filter((s) => segmentIds.includes(s.id));
    }
    if (readySegs.length === 0) {
      return NextResponse.json({ error: "No ready segments to lip-sync." }, { status: 400 });
    }

    // Resolve each speaker's base clip once.
    const baseBySpeaker = new Map<string, BaseClip | null>();
    for (const sp of speakers || []) {
      baseBySpeaker.set(sp.id, await resolveBaseClip(service, sp.persona_id, ownerId));
    }

    let reservedMaxSpend = 0;
    let renderCleared = false;
    const result = {
      selected: 0,
      cached: 0,
      skipped: 0,
      started: 0,
      processing: 0,
      estimatedUsd: 0,
      actualNewSpendUsd: 0,
      fallbackStarted: 0,
      capacityFallbacks: 0,
      capUsd: LIPSYNC_MAX_USD_PER_RENDER,
      skippedReasons: [] as string[],
    };

    for (const seg of readySegs) {
      const base = baseBySpeaker.get(seg.speaker_id) || null;
      if (!base) { result.skipped++; result.skippedReasons.push(`${seg.order_index}:no_base_clip`); continue; }

      const dur = segmentSeconds(seg);
      const segmentProvider = providerSupportsInputSeconds(startProvider, dur)
        ? startProvider
        : getPodcastLipsyncProvider("heygen");
      if (segmentProvider.id !== startProvider.id) {
        result.capacityFallbacks++;
        logProviderEvent("capacity_fallback", {
          podcastId: id,
          segmentId: seg.id,
          fromProvider: startProvider.id,
          toProvider: segmentProvider.id,
          inputSeconds: Math.round(dur * 100) / 100,
          maxInputSeconds: startProvider.capabilities.maxInputSeconds,
        });
      }
      const trim = planLipsyncTrim(dur, base.seconds);
      if (!trim.ok) { result.skipped++; result.skippedReasons.push(`${seg.order_index}:duration_out_of_range`); continue; }

      const cost = estimateProviderLipsyncUsd(segmentProvider, dur);
      const capCost = Math.max(
        cost,
        estimateProviderLipsyncUsd(getPodcastLipsyncProvider("heygen"), dur),
      );
      // Cache key intentionally excludes base_clip_id: the true invalidation
      // signal is the TTS audio (its R2 URL changes when the line is re-synthesized).
      // Keying on the persona's base clip caused double-spend when the resolver
      // picked a newer ready base clip (T-1144b QA, 2026-07-07).
      const cacheKey = lipsyncCacheKey({
        audioUrl: seg.audio_url as string,
        mode,
        providerId: segmentProvider.id,
      });

      // No-double-spend: reuse ANY ready clip for this segment + current audio,
      // regardless of which base clip / cache-key format produced it.
      const { data: preferredReadyRow } = await service
        .from("podcast_segment_lipsync_clips")
        .select("id,video_url")
        .eq("segment_id", seg.id)
        .eq("audio_url", seg.audio_url)
        .eq("provider", segmentProvider.id)
        .eq("status", "ready")
        .not("video_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let readyRow = preferredReadyRow;
      // A Balanced task that already fell back successfully should remain a
      // free cache hit on re-render instead of retrying and spending again.
      if (!readyRow && segmentProvider.id !== "heygen") {
        const { data: fallbackReadyRow } = await service
          .from("podcast_segment_lipsync_clips")
          .select("id,video_url")
          .eq("segment_id", seg.id)
          .eq("audio_url", seg.audio_url)
          .eq("provider", "heygen")
          .eq("status", "ready")
          .not("video_url", "is", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        readyRow = fallbackReadyRow;
      }
      if (readyRow?.video_url) {
        result.selected++;
        result.cached++;
        result.estimatedUsd += cost;
        continue;
      }
      // Already in-flight for this audio → don't spend again.
      const { data: procRow } = await service
        .from("podcast_segment_lipsync_clips")
        .select("id,provider_task_id")
        .eq("segment_id", seg.id)
        .eq("audio_url", seg.audio_url)
        .eq("provider", segmentProvider.id)
        .eq("status", "processing")
        .not("provider_task_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (procRow?.provider_task_id) {
        result.selected++;
        result.processing++;
        result.estimatedUsd += cost;
        continue;
      }

      if (reservedMaxSpend + capCost > LIPSYNC_MAX_USD_PER_RENDER) {
        result.skipped++; result.skippedReasons.push(`${seg.order_index}:over_cap`); continue;
      }

      if (!renderCleared) {
        const { error: resetErr } = await service
          .from("podcasts")
          .update({ video_url: null, render_status: "idle", render_error: null })
          .eq("id", id);
        if (resetErr) {
          console.error("lipsync render reset failed before premium spend:", resetErr);
          return NextResponse.json({ error: "Could not clear the stale video before premium sync." }, { status: 500 });
        }
        renderCleared = true;
      }

      // Create/refresh the cache row BEFORE HeyGen. If this write fails, do not
      // spend credits because we would risk losing the provider task id. Do not
      // use PostgREST upsert here: the DB uniqueness is a partial index
      // (status <> 'removed'), and explicit insert/update is more portable.
      const sp = (speakers || []).find((x) => x.id === seg.speaker_id);
      const queuedRow = {
        podcast_id: id,
        segment_id: seg.id,
        speaker_id: seg.speaker_id,
        persona_id: sp?.persona_id ?? null,
        base_clip_id: base.id,
        audio_url: seg.audio_url,
        cache_key: cacheKey,
        mode,
        provider: segmentProvider.id,
        provider_task_id: null,
        duration_seconds: Math.round(dur * 100) / 100,
        credits_usd: Math.round(cost * 100) / 100,
        status: "processing",
        error_message: null,
        updated_at: new Date().toISOString(),
      };
      const { data: existingCacheRow } = await service
        .from("podcast_segment_lipsync_clips")
        .select("id")
        .eq("segment_id", seg.id)
        .eq("cache_key", cacheKey)
        .maybeSingle();
      const queueWrite = existingCacheRow?.id
        ? service.from("podcast_segment_lipsync_clips").update(queuedRow).eq("id", existingCacheRow.id)
        : service.from("podcast_segment_lipsync_clips").insert(queuedRow);
      const { error: queueErr } = await queueWrite;
      if (queueErr) {
        console.error("lipsync cache row upsert failed before HeyGen call:", queueErr);
        return NextResponse.json({ error: "Could not reserve the lip-sync cache row." }, { status: 500 });
      }

      try {
        // If the audio is shorter than the base clip, trim the clip to match on
        // Modal (ffmpeg there; Vercel can't run it). Otherwise (small overshoot
        // within ±15%) HeyGen handles it, so send the base clip as-is.
        const lipsyncVideoUrl = trim.endTimeSeconds
          ? await trimLipsyncBaseClip({
              podcastId: id,
              segmentId: seg.id,
              baseUrl: base.url,
              durationSeconds: dur,
              cacheKey,
            })
          : base.url;
        let taskProvider = segmentProvider;
        let task;
        try {
          task = await taskProvider.createClip({ videoUrl: lipsyncVideoUrl, audioUrl: seg.audio_url as string, mode });
        } catch (primaryError) {
          if (taskProvider.id === "heygen") throw primaryError;
          const reason = primaryError instanceof Error ? primaryError.message : String(primaryError);
          taskProvider = getPodcastLipsyncProvider("heygen");
          task = await taskProvider.createClip({ videoUrl: lipsyncVideoUrl, audioUrl: seg.audio_url as string, mode });
          result.fallbackStarted++;
          logProviderEvent("fallback_started", {
            podcastId: id,
            segmentId: seg.id,
            fromProvider: segmentProvider.id,
            toProvider: taskProvider.id,
            reason: reason.slice(0, 200),
          });
        }
        const { error: taskErr } = await service
          .from("podcast_segment_lipsync_clips")
          .update({
            provider: taskProvider.id,
            provider_task_id: task.providerTaskId,
            credits_usd: Math.round(estimateProviderLipsyncUsd(taskProvider, dur) * 100) / 100,
            status: "processing",
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("segment_id", seg.id)
          .eq("cache_key", cacheKey);
        if (taskErr) {
          console.error("lipsync task id update failed after provider accepted task:", { providerTaskId: task.providerTaskId, taskErr });
          return NextResponse.json({ error: "Lip-sync task started but could not be saved. Contact support before retrying." }, { status: 502 });
        }
        result.selected++;
        result.started++;
        reservedMaxSpend += capCost;
        const taskCost = estimateProviderLipsyncUsd(taskProvider, dur);
        result.actualNewSpendUsd += taskCost;
        result.estimatedUsd += taskCost;
        logProviderEvent("task_started", {
          podcastId: id,
          segmentId: seg.id,
          requestedQualityMode: routing.requestedQualityMode,
          effectiveQualityMode: routing.effectiveQualityMode,
          provider: taskProvider.id,
          fallback: taskProvider.id !== segmentProvider.id,
        });
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        await service
          .from("podcast_segment_lipsync_clips")
          .update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() })
          .eq("segment_id", seg.id)
          .eq("cache_key", cacheKey);
        result.skipped++;
        result.skippedReasons.push(`${seg.order_index}:create_failed`);
      }
    }

    result.estimatedUsd = Math.round(result.estimatedUsd * 100) / 100;
    result.actualNewSpendUsd = Math.round(result.actualNewSpendUsd * 100) / 100;
    return NextResponse.json({ action, ...result });
  } catch (err) {
    console.error("POST /api/podcasts/[id]/lipsync:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** GET — lightweight status snapshot for the poller/UI. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const service = createServiceClient();
    const { data: podcast } = await service.from("podcasts").select("id,user_id").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: rows } = await service
      .from("podcast_segment_lipsync_clips")
      .select("segment_id,audio_url,status,video_url,error_message,updated_at")
      .eq("podcast_id", id);
    const counts = { pending: 0, processing: 0, ready: 0, failed: 0 };
    for (const r of rows || []) counts[(r.status as keyof typeof counts)] = (counts[(r.status as keyof typeof counts)] || 0) + 1;

    const { data: segments } = await service
      .from("podcast_segments")
      .select("id,order_index,audio_url,status")
      .eq("podcast_id", id)
      .order("order_index", { ascending: true });
    const segmentSnapshots: SegmentSnapshot[] = (segments || []).map((seg) => {
      if (seg.status !== "ready" || !seg.audio_url) return { segment_id: seg.id, status: "needs_voice" };
      const currentRows = (rows || [])
        .filter((row) => row.segment_id === seg.id && row.audio_url === seg.audio_url)
        .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
      const ready = currentRows.find((row) => row.status === "ready" && row.video_url);
      if (ready) return { segment_id: seg.id, status: "ready" };
      const processing = currentRows.find((row) => row.status === "processing");
      if (processing) return { segment_id: seg.id, status: "processing" };
      const failed = currentRows.find((row) => row.status === "failed");
      if (failed) return { segment_id: seg.id, status: "failed", error_message: failed.error_message || null };
      return { segment_id: seg.id, status: "missing" };
    });
    return NextResponse.json({ counts, segments: segmentSnapshots });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
