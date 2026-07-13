import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { createAvatarVideo, createPhotoAvatar, getHeyGenTask } from "@/lib/heygen-client";
import { createBytePlusTask, getBytePlusTask } from "@/lib/byteplus-client";
import { uploadBufferToR2 } from "@/lib/r2";

export const maxDuration = 60;

const PORTRAIT_BUCKET = "podcast-personas";
const VALID_ASPECTS = new Set(["16:9", "9:16", "1:1"]);
const VALID_RESOLUTIONS = new Set(["720p", "1080p"]);
const DEFAULT_ASPECT = "16:9";
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_CLIP_KIND = "talking_head";
const DEFAULT_PROMPT_VERSION = "base-v2-8s";
const DEFAULT_BYTEPLUS_ENGINE = "seedance10pro_fast_byteplus";
const VALID_PROVIDERS = new Set(["heygen", "byteplus"]);
const DEFAULT_MOTION_PROMPT =
  "Natural podcast host listening attentively in a professional studio. Subtle breathing, occasional blinking, small head movements and relaxed hand gestures. Keep the camera locked, preserve identity, clothing, microphone, desk and studio background. No speaking, no exaggerated motion, no camera movement.";
const DEFAULT_SCRIPT =
  "Welcome back to the show. Today we're exploring one practical idea, why it matters, how it works, and what you can do next to put it into practice.";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface PersonaRow {
  id: string;
  name: string;
  portrait_path: string;
  status: string;
}

interface BaseClipRow {
  id: string;
  persona_id: string;
  provider: string;
  provider_avatar_id: string | null;
  provider_video_id: string | null;
  aspect_ratio: string;
  resolution: string;
  clip_kind: string;
  prompt_version: string;
  video_url: string | null;
  storage_key: string | null;
  duration_seconds: number | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function cleanDimension(value: unknown, allowed: Set<string>, fallback: string) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function cleanPromptVersion(value: unknown) {
  const v = typeof value === "string" ? value.trim() : "";
  return v && v.length <= 80 ? v : DEFAULT_PROMPT_VERSION;
}

function publicClip(row: BaseClipRow, reused = false) {
  return {
    id: row.id,
    persona_id: row.persona_id,
    provider: row.provider,
    status: row.status,
    provider_avatar_id: row.provider_avatar_id,
    provider_video_id: row.provider_video_id,
    aspect_ratio: row.aspect_ratio,
    resolution: row.resolution,
    clip_kind: row.clip_kind,
    prompt_version: row.prompt_version,
    video_url: row.video_url,
    duration_seconds: row.duration_seconds,
    error_message: row.error_message,
    reused,
  };
}

async function resolvePortraitUrl(service: ServiceClient, portraitPath: string) {
  if (isHttpUrl(portraitPath)) return portraitPath;
  const { data, error } = await service.storage
    .from(PORTRAIT_BUCKET)
    .createSignedUrl(portraitPath, 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign persona portrait: ${error?.message ?? "no signed URL"}`);
  }
  return data.signedUrl;
}

async function loadPersona(service: ServiceClient, personaId: string): Promise<PersonaRow | null> {
  const { data, error } = await service
    .from("podcast_personas")
    .select("id,name,portrait_path,status")
    .eq("id", personaId)
    .maybeSingle();
  if (error) throw new Error(`Could not load persona: ${error.message}`);
  if (!data || data.status !== "active") return null;
  return data as PersonaRow;
}

async function findClip(
  service: ServiceClient,
  personaId: string,
  provider: string,
  aspectRatio: string,
  resolution: string,
  promptVersion: string,
): Promise<BaseClipRow | null> {
  const { data, error } = await service
    .from("podcast_persona_base_clips")
    .select("*")
    .eq("persona_id", personaId)
    .eq("provider", provider)
    .eq("aspect_ratio", aspectRatio)
    .eq("resolution", resolution)
    .eq("clip_kind", DEFAULT_CLIP_KIND)
    .eq("prompt_version", promptVersion)
    .neq("status", "removed")
    .maybeSingle();
  if (error) throw new Error(`Could not load base clip: ${error.message}`);
  return (data as BaseClipRow | null) ?? null;
}

async function insertClip(
  service: ServiceClient,
  personaId: string,
  provider: string,
  aspectRatio: string,
  resolution: string,
  promptVersion: string,
): Promise<BaseClipRow> {
  const { data, error } = await service
    .from("podcast_persona_base_clips")
    .insert({
      persona_id: personaId,
      provider,
      aspect_ratio: aspectRatio,
      resolution,
      clip_kind: DEFAULT_CLIP_KIND,
      prompt_version: promptVersion,
      status: "pending",
      metadata: {},
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Could not create base clip row: ${error?.message ?? "no row"}`);
  return data as BaseClipRow;
}

async function updateClip(
  service: ServiceClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<BaseClipRow> {
  const { data, error } = await service
    .from("podcast_persona_base_clips")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Could not update base clip row: ${error?.message ?? "no row"}`);
  return data as BaseClipRow;
}

// HeyGen sometimes 400s createAvatarVideo right after createPhotoAvatar because
// the photo avatar isn't processed yet ("missing image dimensions"). That's a
// transient not-ready state, not a real failure — we keep the row pending and
// let a later ensure retry (T-1143b P2 fix).
function isAvatarNotReady(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("missing image dimensions") ||
    msg.includes("re-upload the photo") ||
    msg.includes("avatar not ready") ||
    msg.includes("still processing")
  );
}

async function handleEnsure(service: ServiceClient, body: Record<string, unknown>) {
  const personaId = typeof body.persona_id === "string" ? body.persona_id : "";
  if (!personaId) return jsonError("persona_id is required", 400);

  const provider =
    typeof body.provider === "string" && VALID_PROVIDERS.has(body.provider)
      ? body.provider
      : "heygen";
  const voiceId = typeof body.voice_id === "string" ? body.voice_id.trim() : "";
  if (provider === "heygen" && !voiceId) return jsonError("voice_id is required", 400);

  const aspectRatio = cleanDimension(body.aspect_ratio, VALID_ASPECTS, DEFAULT_ASPECT);
  const resolution = cleanDimension(body.resolution, VALID_RESOLUTIONS, DEFAULT_RESOLUTION);
  const promptVersion = cleanPromptVersion(body.prompt_version);
  const force = body.force === true;
  const requestedSourceImageUrl =
    typeof body.source_image_url === "string" && isHttpUrl(body.source_image_url)
      ? body.source_image_url
      : "";
  const scriptText =
    typeof body.script_text === "string" && body.script_text.trim()
      ? body.script_text.trim().slice(0, 600)
      : DEFAULT_SCRIPT;
  const motionPrompt =
    typeof body.motion_prompt === "string" && body.motion_prompt.trim()
      ? body.motion_prompt.trim().slice(0, 2000)
      : DEFAULT_MOTION_PROMPT;
  const requestedDuration = Math.max(
    4,
    Math.min(12, Math.round(typeof body.duration_seconds === "number" ? body.duration_seconds : 5)),
  );

  const persona = await loadPersona(service, personaId);
  if (!persona) return jsonError("Persona not found", 404);

  let clip = await findClip(service, personaId, provider, aspectRatio, resolution, promptVersion);

  // ── Cache hits ─────────────────────────────────────────────────────────
  if (clip?.status === "ready" && clip.video_url && !force) {
    return NextResponse.json({ clip: publicClip(clip, true), status: "ready", stage: "ready", reused: true });
  }
  if (clip?.status === "pending" && clip.provider_video_id && !force) {
    // Video already queued — poll() drives it to ready from here.
    return NextResponse.json({ clip: publicClip(clip, true), status: "pending", stage: "video_processing", reused: true });
  }

  // ── Create or reset the row to a fresh pending cycle ───────────────────
  if (!clip) {
    clip = await insertClip(service, personaId, provider, aspectRatio, resolution, promptVersion);
  } else if (force || clip.status === "failed" || clip.status === "ready") {
    const patch: Record<string, unknown> = {
      status: "pending",
      error_message: null,
      provider_video_id: null,
      video_url: null,
      storage_key: null,
      duration_seconds: null,
      metadata: { ...(clip.metadata ?? {}), restarted_at: new Date().toISOString(), force },
    };
    // force restarts the whole staged cycle, including a fresh photo avatar.
    if (force && provider === "heygen") patch.provider_avatar_id = null;
    clip = await updateClip(service, clip.id, patch);
  }

  // BytePlus creates a neutral motion base directly from the selected studio
  // frame. It deliberately has no voice; segment audio/lip-sync is layered by
  // the downstream provider-neutral podcast pipeline.
  if (provider === "byteplus") {
    if (!clip.provider_video_id) {
      const cachedSourceImageUrl =
        typeof clip.metadata?.source_image_url === "string" && isHttpUrl(clip.metadata.source_image_url)
          ? clip.metadata.source_image_url
          : "";
      const imageUrl =
        requestedSourceImageUrl ||
        cachedSourceImageUrl ||
        (await resolvePortraitUrl(service, persona.portrait_path));
      const taskId = await createBytePlusTask({
        engineKey: DEFAULT_BYTEPLUS_ENGINE,
        prompt: motionPrompt,
        duration: requestedDuration,
        imageUrl,
        aspectRatio,
        generateAudio: false,
      });
      clip = await updateClip(service, clip.id, {
        provider_video_id: taskId,
        status: "pending",
        error_message: null,
        metadata: {
          ...(clip.metadata ?? {}),
          source_image_url: imageUrl,
          engine_key: DEFAULT_BYTEPLUS_ENGINE,
          requested_duration_seconds: requestedDuration,
          motion_prompt: motionPrompt,
          base_video_started_at: new Date().toISOString(),
        },
      });
      return NextResponse.json({
        clip: publicClip(clip),
        status: "pending",
        stage: "video_processing",
        reused: false,
      });
    }
    return NextResponse.json({
      clip: publicClip(clip),
      status: "pending",
      stage: "video_processing",
      reused: false,
    });
  }

  // ── STAGE 1 — no avatar yet: create the photo avatar and STOP. ─────────
  // Do NOT call createAvatarVideo in the same request; the avatar needs time
  // to process. The caller re-invokes ensure to move to stage 2.
  if (!clip.provider_avatar_id) {
    const cachedSourceImageUrl =
      typeof clip.metadata?.source_image_url === "string" && isHttpUrl(clip.metadata.source_image_url)
        ? clip.metadata.source_image_url
        : "";
    const imageUrl = requestedSourceImageUrl || cachedSourceImageUrl || await resolvePortraitUrl(service, persona.portrait_path);
    const photo = await createPhotoAvatar({ imageUrl, name: `${persona.name} podcast base` });
    clip = await updateClip(service, clip.id, {
      provider_avatar_id: photo.avatarId,
      status: "pending",
      error_message: null,
      metadata: {
        ...(clip.metadata ?? {}),
        ...(requestedSourceImageUrl ? { source_image_url: requestedSourceImageUrl } : {}),
        photo_avatar_status: photo.status,
        photo_avatar_created_at: new Date().toISOString(),
      },
    });
    return NextResponse.json({ clip: publicClip(clip), status: "pending", stage: "avatar_processing", reused: false });
  }

  // ── STAGE 2 — avatar exists, no video: try to start the base video. ────
  if (!clip.provider_video_id) {
    try {
      const task = await createAvatarVideo({
        avatarId: clip.provider_avatar_id,
        voiceId,
        scriptText,
        aspectRatio,
        resolution,
      });
      clip = await updateClip(service, clip.id, {
        provider_video_id: task.taskId,
        status: "pending",
        error_message: null,
        metadata: {
          ...(clip.metadata ?? {}),
          base_video_status: task.status,
          base_video_started_at: new Date().toISOString(),
          script_words: scriptText.split(/\s+/).filter(Boolean).length,
        },
      });
      return NextResponse.json({ clip: publicClip(clip), status: "pending", stage: "video_processing", reused: false });
    } catch (err) {
      if (isAvatarNotReady(err)) {
        // Avatar still processing — stay pending (not failed), retry on next ensure.
        clip = await updateClip(service, clip.id, {
          status: "pending",
          error_message: null,
          metadata: { ...(clip.metadata ?? {}), avatar_not_ready_at: new Date().toISOString() },
        });
        return NextResponse.json({ clip: publicClip(clip), status: "pending", stage: "avatar_processing", reused: false });
      }
      throw err;
    }
  }

  // ── STAGE 3 — video already queued: hand off to poll. ──────────────────
  return NextResponse.json({ clip: publicClip(clip), status: "pending", stage: "video_processing", reused: false });
}

async function handlePoll(service: ServiceClient, body: Record<string, unknown>) {
  const clipId = typeof body.clip_id === "string" ? body.clip_id : "";
  if (!clipId) return jsonError("clip_id is required", 400);

  const { data, error } = await service
    .from("podcast_persona_base_clips")
    .select("*")
    .eq("id", clipId)
    .maybeSingle();
  if (error) throw new Error(`Could not load base clip: ${error.message}`);
  const clip = data as BaseClipRow | null;
  if (!clip || clip.status === "removed") return jsonError("Base clip not found", 404);
  if (clip.status === "ready" && clip.video_url) {
    return NextResponse.json({ clip: publicClip(clip, true), status: "ready", reused: true });
  }
  if (!clip.provider_video_id) return jsonError("Base clip has no provider video task", 400);

  const task =
    clip.provider === "byteplus"
      ? await getBytePlusTask(clip.provider_video_id)
      : await getHeyGenTask(clip.provider_video_id);
  if (task.status === "pending" || task.status === "processing") {
    const updated = await updateClip(service, clip.id, {
      status: "pending",
      metadata: { ...(clip.metadata ?? {}), last_poll_at: new Date().toISOString(), provider_status: task.status },
    });
    return NextResponse.json({ clip: publicClip(updated), status: task.status });
  }
  if (task.status === "failed") {
    const updated = await updateClip(service, clip.id, {
      status: "failed",
      error_message: task.error ?? `${clip.provider} base clip failed`,
      metadata: { ...(clip.metadata ?? {}), failed_at: new Date().toISOString() },
    });
    return NextResponse.json({ clip: publicClip(updated), status: "failed" });
  }
  if (!task.videoUrl) throw new Error(`${clip.provider} completed without a video URL`);

  const res = await fetch(task.videoUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not download ${clip.provider} base clip: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) {
    throw new Error(`${clip.provider} base clip is suspiciously small (${buffer.length} bytes)`);
  }

  const key = `podcast/base-clips/${clip.persona_id}/${clip.id}-${randomUUID()}.mp4`;
  const url = await uploadBufferToR2(buffer, key, "video/mp4");
  const updated = await updateClip(service, clip.id, {
    status: "ready",
    video_url: url,
    storage_key: key,
    duration_seconds:
      "duration" in task && typeof task.duration === "number"
        ? task.duration
        : typeof clip.metadata?.requested_duration_seconds === "number"
          ? clip.metadata.requested_duration_seconds
          : null,
    error_message: null,
    metadata: {
      ...(clip.metadata ?? {}),
      provider_completed_at: new Date().toISOString(),
      bytes: buffer.length,
    },
  });
  return NextResponse.json({ clip: publicClip(updated), status: "ready", reused: false });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const service = createServiceClient();

  try {
    if (action === "ensure") return await handleEnsure(service, body);
    if (action === "poll") return await handlePoll(service, body);
    return jsonError("action must be 'ensure' or 'poll'", 400);
  } catch (err) {
    console.error("POST /api/admin/podcast-base-clips:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
