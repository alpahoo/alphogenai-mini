import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { createAvatarVideo, createPhotoAvatar, getHeyGenTask } from "@/lib/heygen-client";
import { uploadBufferToR2 } from "@/lib/r2";

export const maxDuration = 60;

const PORTRAIT_BUCKET = "podcast-personas";
const VALID_ASPECTS = new Set(["16:9", "9:16", "1:1"]);
const VALID_RESOLUTIONS = new Set(["720p", "1080p"]);
const DEFAULT_ASPECT = "16:9";
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_CLIP_KIND = "talking_head";
const DEFAULT_PROMPT_VERSION = "base-v1";
const DEFAULT_SCRIPT =
  "Welcome back to the show. Today we are unpacking one clear idea, step by step.";

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
  aspectRatio: string,
  resolution: string,
  promptVersion: string,
): Promise<BaseClipRow | null> {
  const { data, error } = await service
    .from("podcast_persona_base_clips")
    .select("*")
    .eq("persona_id", personaId)
    .eq("provider", "heygen")
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
  aspectRatio: string,
  resolution: string,
  promptVersion: string,
): Promise<BaseClipRow> {
  const { data, error } = await service
    .from("podcast_persona_base_clips")
    .insert({
      persona_id: personaId,
      provider: "heygen",
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

async function handleEnsure(service: ServiceClient, body: Record<string, unknown>) {
  const personaId = typeof body.persona_id === "string" ? body.persona_id : "";
  if (!personaId) return jsonError("persona_id is required", 400);

  const voiceId = typeof body.voice_id === "string" ? body.voice_id.trim() : "";
  if (!voiceId) return jsonError("voice_id is required", 400);

  const aspectRatio = cleanDimension(body.aspect_ratio, VALID_ASPECTS, DEFAULT_ASPECT);
  const resolution = cleanDimension(body.resolution, VALID_RESOLUTIONS, DEFAULT_RESOLUTION);
  const promptVersion = cleanPromptVersion(body.prompt_version);
  const force = body.force === true;
  const scriptText =
    typeof body.script_text === "string" && body.script_text.trim()
      ? body.script_text.trim().slice(0, 600)
      : DEFAULT_SCRIPT;

  const persona = await loadPersona(service, personaId);
  if (!persona) return jsonError("Persona not found", 404);

  let clip = await findClip(service, personaId, aspectRatio, resolution, promptVersion);
  if (clip?.status === "ready" && clip.video_url && !force) {
    return NextResponse.json({ clip: publicClip(clip, true), status: "ready", reused: true });
  }
  if (clip?.status === "pending" && clip.provider_video_id && !force) {
    return NextResponse.json({ clip: publicClip(clip, true), status: "pending", reused: true });
  }

  if (!clip) {
    clip = await insertClip(service, personaId, aspectRatio, resolution, promptVersion);
  } else if (force || clip.status === "failed" || clip.status === "ready") {
    clip = await updateClip(service, clip.id, {
      status: "pending",
      error_message: null,
      provider_video_id: null,
      video_url: null,
      storage_key: null,
      duration_seconds: null,
      metadata: { ...(clip.metadata ?? {}), restarted_at: new Date().toISOString(), force },
    });
  }

  let providerAvatarId = clip.provider_avatar_id;
  if (!providerAvatarId || force) {
    const imageUrl = await resolvePortraitUrl(service, persona.portrait_path);
    const photo = await createPhotoAvatar({
      imageUrl,
      name: `${persona.name} podcast base`,
    });
    providerAvatarId = photo.avatarId;
    clip = await updateClip(service, clip.id, {
      provider_avatar_id: providerAvatarId,
      error_message: null,
      metadata: {
        ...(clip.metadata ?? {}),
        photo_avatar_status: photo.status,
        photo_avatar_created_at: new Date().toISOString(),
      },
    });
  }

  const task = await createAvatarVideo({
    avatarId: providerAvatarId,
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

  return NextResponse.json({ clip: publicClip(clip), status: "pending", reused: false });
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

  const task = await getHeyGenTask(clip.provider_video_id);
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
      error_message: task.error ?? "HeyGen base clip failed",
      metadata: { ...(clip.metadata ?? {}), failed_at: new Date().toISOString() },
    });
    return NextResponse.json({ clip: publicClip(updated), status: "failed" });
  }
  if (!task.videoUrl) throw new Error("HeyGen completed without a video URL");

  const res = await fetch(task.videoUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not download HeyGen base clip: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`HeyGen base clip is suspiciously small (${buffer.length} bytes)`);

  const key = `podcast/base-clips/${clip.persona_id}/${clip.id}-${randomUUID()}.mp4`;
  const url = await uploadBufferToR2(buffer, key, "video/mp4");
  const updated = await updateClip(service, clip.id, {
    status: "ready",
    video_url: url,
    storage_key: key,
    duration_seconds: task.duration ?? null,
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
  const auth = await requireAdmin();
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
