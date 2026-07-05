import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createLipsync, getLipsyncTask } from "@/lib/heygen-client";
import { uploadBufferToR2 } from "@/lib/r2";
import {
  LIPSYNC_USD_PER_SECOND,
  LIPSYNC_MAX_USD_PER_RENDER,
  lipsyncCacheKey,
  planLipsyncTrim,
  secondsFromText,
} from "@/lib/podcast/lipsync-estimate";

/**
 * POST /api/podcasts/[id]/lipsync — T-1144b Phase 1 (capped, cached, fallback-safe).
 *
 * Next orchestrates HeyGen (key stays server-side); Modal only composites the
 * cached clips later. This route spends REAL credits, so it is hard-capped at
 * LIPSYNC_MAX_USD_PER_RENDER: segments are lip-synced greedily in order until the
 * cap is reached; the rest are left for the talking_visual fallback. Cache hits
 * (same audio + base clip + mode) never re-spend.
 *
 * Body: { action: "start" | "poll" }.  "start" creates/reuses per-segment jobs;
 * "poll" advances processing jobs → ready (upload to R2) or failed. The client
 * polls until nothing is processing, then triggers the premium render.
 */
export const maxDuration = 60;

const MODE = "precision" as const;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg-static binary not available"));
    const child = spawn(ffmpegPath as string, args, { stdio: ["ignore", "ignore", "pipe"] });
    const chunks: Buffer[] = [];
    child.stderr.on("data", (c) => chunks.push(Buffer.from(c)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(chunks).toString("utf8").slice(0, 600)}`));
    });
  });
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function createTrimmedBaseClipUrl(input: {
  podcastId: string;
  segmentId: string;
  baseUrl: string;
  durationSeconds: number;
  cacheKey: string;
}): Promise<string> {
  const dur = Math.max(0.5, Math.round(input.durationSeconds * 100) / 100);
  const dir = path.join(os.tmpdir(), `alphogen-lipsync-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const inPath = path.join(dir, "base.mp4");
  const outPath = path.join(dir, "trimmed.mp4");
  try {
    await writeFile(inPath, await fetchBuffer(input.baseUrl));
    // HeyGen enforces audio/video duration within +/-15%. Physically trim the
    // source clip before calling HeyGen; the API's end_time hint is not enough.
    await runFfmpeg([
      "-y",
      "-i", inPath,
      "-t", String(dur),
      "-an",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "veryfast",
      "-movflags", "+faststart",
      outPath,
    ]);
    const key = `podcast/lipsync-trim/${input.podcastId}/${input.segmentId}-${input.cacheKey}.mp4`;
    return await uploadBufferToR2(await readFile(outPath), key, "video/mp4");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

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
    .eq("prompt_version", "base-v1")
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
    const action = body.action === "poll" ? "poll" : "start";

    const { data: podcast } = await service.from("podcasts").select("id,user_id").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ownerId = podcast.user_id as string;

    if (action === "poll") {
      const { data: rows } = await service
        .from("podcast_segment_lipsync_clips")
        .select("id,provider_task_id,status")
        .eq("podcast_id", id)
        .eq("status", "processing");
      let ready = 0, failed = 0, processing = 0;
      for (const row of rows || []) {
        if (!row.provider_task_id) { processing++; continue; }
        try {
          const r = await getLipsyncTask(row.provider_task_id);
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
            ready++;
          } else if (r.status === "failed") {
            await service.from("podcast_segment_lipsync_clips")
              .update({ status: "failed", error_message: (r.error || "lipsync failed").slice(0, 500), updated_at: new Date().toISOString() })
              .eq("id", row.id);
            failed++;
          } else {
            processing++;
          }
        } catch (e) {
          await service.from("podcast_segment_lipsync_clips")
            .update({ status: "failed", error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500), updated_at: new Date().toISOString() })
            .eq("id", row.id);
          failed++;
        }
      }
      return NextResponse.json({ action, ready, failed, processing });
    }

    // ---- action === "start" ----
    const { data: speakers } = await service
      .from("podcast_speakers").select("id,role,persona_id").eq("podcast_id", id);
    const { data: segments } = await service
      .from("podcast_segments")
      .select("id,speaker_id,order_index,text,audio_url,start_ms,end_ms,status")
      .eq("podcast_id", id)
      .order("order_index", { ascending: true });

    const readySegs = (segments || []).filter((s) => s.status === "ready" && s.audio_url);
    if (readySegs.length === 0) {
      return NextResponse.json({ error: "No ready segments to lip-sync." }, { status: 400 });
    }

    // Resolve each speaker's base clip once.
    const baseBySpeaker = new Map<string, BaseClip | null>();
    for (const sp of speakers || []) {
      baseBySpeaker.set(sp.id, await resolveBaseClip(service, sp.persona_id, ownerId));
    }

    let newSpend = 0;
    const result = {
      selected: 0,
      cached: 0,
      skipped: 0,
      started: 0,
      processing: 0,
      estimatedUsd: 0,
      actualNewSpendUsd: 0,
      capUsd: LIPSYNC_MAX_USD_PER_RENDER,
      skippedReasons: [] as string[],
    };

    for (const seg of readySegs) {
      const base = baseBySpeaker.get(seg.speaker_id) || null;
      if (!base) { result.skipped++; result.skippedReasons.push(`${seg.order_index}:no_base_clip`); continue; }

      const dur = segmentSeconds(seg);
      const trim = planLipsyncTrim(dur, base.seconds);
      if (!trim.ok) { result.skipped++; result.skippedReasons.push(`${seg.order_index}:duration_out_of_range`); continue; }

      const cost = dur * LIPSYNC_USD_PER_SECOND;
      const cacheKey = lipsyncCacheKey({ audioUrl: seg.audio_url as string, baseClipId: base.id, mode: MODE });

      // Cache hit? (same segment + key already ready or already processing)
      const { data: existing } = await service
        .from("podcast_segment_lipsync_clips")
        .select("id,status,video_url,provider_task_id")
        .eq("segment_id", seg.id)
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (existing?.status === "ready" && existing.video_url) {
        result.selected++;
        result.cached++;
        result.estimatedUsd += cost;
        continue;
      }
      if (existing?.status === "processing" && existing.provider_task_id) {
        result.selected++;
        result.processing++;
        result.estimatedUsd += cost;
        continue;
      }

      if (newSpend + cost > LIPSYNC_MAX_USD_PER_RENDER) {
        result.skipped++; result.skippedReasons.push(`${seg.order_index}:over_cap`); continue;
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
        mode: MODE,
        provider: "heygen",
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
        const lipsyncVideoUrl = trim.endTimeSeconds
          ? await createTrimmedBaseClipUrl({
              podcastId: id,
              segmentId: seg.id,
              baseUrl: base.url,
              durationSeconds: dur,
              cacheKey,
            })
          : base.url;
        const taskId = await createLipsync(lipsyncVideoUrl, seg.audio_url as string, MODE);
        const { error: taskErr } = await service
          .from("podcast_segment_lipsync_clips")
          .update({ provider_task_id: taskId, status: "processing", error_message: null, updated_at: new Date().toISOString() })
          .eq("segment_id", seg.id)
          .eq("cache_key", cacheKey);
        if (taskErr) {
          console.error("lipsync task id update failed after HeyGen accepted task:", { taskId, taskErr });
          return NextResponse.json({ error: "Lip-sync task started but could not be saved. Contact support before retrying." }, { status: 502 });
        }
        result.selected++;
        result.started++;
        newSpend += cost;
        result.actualNewSpendUsd += cost;
        result.estimatedUsd += cost;
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
      .select("status")
      .eq("podcast_id", id);
    const counts = { pending: 0, processing: 0, ready: 0, failed: 0 };
    for (const r of rows || []) counts[(r.status as keyof typeof counts)] = (counts[(r.status as keyof typeof counts)] || 0) + 1;
    return NextResponse.json({ counts });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
