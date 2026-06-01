/**
 * HeyGen API client — Avatar IV video generation.
 *
 * Creates talking avatar videos from a photo + text script.
 * Supports Photo Avatars, voice cloning, and Avatar IV full-body generation.
 *
 * Flow:
 *   1. POST /v1/photo_avatars  → Create avatar from photo (one-time)
 *   2. POST /v3/voices/clone   → Clone voice from audio sample (one-time)
 *   3. POST /v3/videos         → Generate avatar video (text + avatar + voice)
 *   4. GET  /v3/videos/{id}    → Poll until completed/failed
 *
 * API key: HEYGEN_API_KEY (Vercel env var)
 * Docs: https://developers.heygen.com
 */

const HEYGEN_API_V1 = "https://api.heygen.com/v1";
const HEYGEN_API_V2 = "https://api.heygen.com/v2";
const HEYGEN_API_V3 = "https://api.heygen.com/v3";

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY not configured");
  return key.trim();
}

function headers(): Record<string, string> {
  return {
    "X-Api-Key": getApiKey(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ---------------------------------------------------------------------------
// Photo Avatar creation (one-time per user image)
// ---------------------------------------------------------------------------

export interface CreatePhotoAvatarParams {
  /** Public URL of the portrait photo (JPG/PNG, ≤10MB) */
  imageUrl: string;
  /** Display name for this avatar */
  name?: string;
}

export interface PhotoAvatar {
  avatarId: string;
  status: string;
}

/**
 * Create a Photo Avatar from a single portrait image.
 * Cost: $1.00 per operation.
 * Returns the avatar_id to use in video generation.
 */
export async function createPhotoAvatar(
  params: CreatePhotoAvatarParams
): Promise<PhotoAvatar> {
  const res = await fetch(`${HEYGEN_API_V1}/photo_avatars`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      image_url: params.imageUrl,
      name: params.name ?? "AlphoGen Avatar",
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`HeyGen createPhotoAvatar failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const avatarId =
    data.data?.photo_avatar_id ??
    data.data?.avatar_id ??
    data.photo_avatar_id ??
    data.avatar_id;

  if (!avatarId) {
    throw new Error(
      `HeyGen returned no avatar_id: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  return {
    avatarId: String(avatarId),
    status: data.data?.status ?? "created",
  };
}

// ---------------------------------------------------------------------------
// List existing avatars
// ---------------------------------------------------------------------------

export interface HeyGenAvatar {
  avatarId: string;
  name: string;
  gender: string;
  previewUrl: string | null;
}

/**
 * List all avatars on the account (stock + photo avatars).
 * Allows retrieving avatar_id for avatars created via the dashboard.
 */
export async function listAvatars(): Promise<HeyGenAvatar[]> {
  const res = await fetch(`${HEYGEN_API_V2}/avatars`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`HeyGen listAvatars failed (${res.status})`);
  }

  const data = await res.json();
  const avatars = data.data?.avatars ?? data.avatars ?? [];
  return avatars.map((a: Record<string, unknown>) => ({
    avatarId: String(a.avatar_id ?? a.id ?? ""),
    name: String(a.avatar_name ?? a.name ?? ""),
    gender: String(a.gender ?? ""),
    previewUrl: (a.preview_image_url as string) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Voice clone (one-time per user voice)
// ---------------------------------------------------------------------------

export interface CloneVoiceParams {
  /** Public URL of voice sample audio (MP3/WAV, 30s–5min recommended) */
  audioUrl: string;
  /** Display name */
  name?: string;
}

export interface ClonedVoice {
  voiceId: string;
}

/**
 * Clone a voice from an audio sample.
 * Returns the voice_id to use in video generation.
 */
export async function cloneVoice(params: CloneVoiceParams): Promise<ClonedVoice> {
  const res = await fetch(`${HEYGEN_API_V3}/voices/clone`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      audio_url: params.audioUrl,
      name: params.name ?? "AlphoGen Voice",
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`HeyGen cloneVoice failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const voiceId = data.data?.voice_id ?? data.voice_id;

  if (!voiceId) {
    throw new Error(
      `HeyGen returned no voice_id: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  return { voiceId: String(voiceId) };
}

// ---------------------------------------------------------------------------
// List available voices
// ---------------------------------------------------------------------------

export interface HeyGenVoice {
  voiceId: string;
  name: string;
  language: string;
  gender: string;
  isCloned: boolean;
  /** URL to a short audio sample for preview playback */
  previewUrl: string | null;
}

/**
 * List all voices available on the account (stock + cloned).
 * Uses /v2/voices (the correct endpoint — /v3/voices does not exist for listing).
 */
export async function listVoices(): Promise<HeyGenVoice[]> {
  const res = await fetch(`${HEYGEN_API_V2}/voices`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`HeyGen listVoices failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const voices = data.data?.voices ?? data.voices ?? [];
  return voices.map((v: Record<string, unknown>) => ({
    voiceId: String(v.voice_id ?? v.id ?? ""),
    name: String(v.name ?? ""),
    language: String(v.language ?? "en"),
    gender: String(v.gender ?? ""),
    isCloned: Boolean(v.is_cloned ?? v.type === "cloned"),
    previewUrl:
      (v.preview_audio as string) ??
      (v.preview_url as string) ??
      (v.sample_url as string) ??
      null,
  }));
}

// ---------------------------------------------------------------------------
// Avatar video generation
// ---------------------------------------------------------------------------

export interface CreateAvatarVideoParams {
  /** Photo avatar ID (from createPhotoAvatar) */
  avatarId: string;
  /** Script text for the avatar to speak */
  scriptText: string;
  /** Voice ID (cloned or stock) */
  voiceId: string;
  /** Video dimensions (default "1920x1080") */
  dimensions?: string;
  /** Motion prompt for gestures/posture (Avatar IV feature) */
  motionPrompt?: string;
}

export interface AvatarVideoTask {
  taskId: string;
  status: string;
}

/**
 * Generate an Avatar IV video.
 * Cost: ~$0.05/sec (1080p Photo Avatar) → ~$3/min.
 *
 * Returns a task ID for polling.
 */
export async function createAvatarVideo(
  params: CreateAvatarVideoParams
): Promise<AvatarVideoTask> {
  const body: Record<string, unknown> = {
    type: "avatar",
    avatar_id: params.avatarId,
    engine: { type: "avatar_v" },
    input: {
      type: "script",
      script: {
        text: params.scriptText,
        voice_id: params.voiceId,
      },
    },
  };

  // Optional dimensions
  if (params.dimensions) {
    body.dimensions = params.dimensions;
  }

  // Avatar IV custom motion prompt
  if (params.motionPrompt) {
    body.motion_prompt = params.motionPrompt;
  }

  const res = await fetch(`${HEYGEN_API_V3}/videos`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`HeyGen createAvatarVideo failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const taskId = data.data?.video_id ?? data.data?.id ?? data.video_id ?? data.id;

  if (!taskId) {
    throw new Error(
      `HeyGen returned no video task ID: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  console.log(`[heygen] video task created: ${taskId}`);
  return {
    taskId: String(taskId),
    status: data.data?.status ?? "pending",
  };
}

// ---------------------------------------------------------------------------
// Task polling
// ---------------------------------------------------------------------------

export type HeyGenTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface HeyGenTaskResult {
  status: HeyGenTaskStatus;
  videoUrl?: string;
  error?: string;
  duration?: number;
}

/**
 * Poll a HeyGen video generation task.
 * Called lazily from GET /api/jobs/[id] on each frontend poll.
 */
export async function getHeyGenTask(taskId: string): Promise<HeyGenTaskResult> {
  const res = await fetch(`${HEYGEN_API_V3}/videos/${taskId}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`HeyGen poll failed (${res.status})`);
  }

  const data = await res.json();
  const videoData = data.data ?? data;
  const state = String(videoData.status ?? "unknown").toLowerCase();

  // ── Completed ─────────────────────────────────────────────────────────
  if (["completed", "done", "success"].includes(state)) {
    const videoUrl =
      videoData.video_url ??
      videoData.download_url ??
      videoData.url ??
      videoData.result?.video_url;

    if (!videoUrl) {
      console.error(
        `[heygen] task ${taskId} completed but no URL found. Keys: ${Object.keys(videoData).join(", ")}`
      );
      throw new Error("HeyGen task completed but no video URL found");
    }

    console.log(`[heygen] task ${taskId} completed → ${String(videoUrl).slice(0, 80)}`);
    return {
      status: "completed",
      videoUrl: String(videoUrl),
      duration: videoData.duration ? Number(videoData.duration) : undefined,
    };
  }

  // ── Failed ────────────────────────────────────────────────────────────
  if (["failed", "error", "cancelled"].includes(state)) {
    const error =
      videoData.error?.message ??
      videoData.error ??
      videoData.message ??
      "Unknown HeyGen error";
    return { status: "failed", error: String(error) };
  }

  // ── In progress ───────────────────────────────────────────────────────
  return {
    status: ["pending", "queued", "waiting"].includes(state) ? "pending" : "processing",
  };
}

// ---------------------------------------------------------------------------
// Engine helper
// ---------------------------------------------------------------------------

/** Returns true if the engine key is a HeyGen avatar engine. */
export function isHeyGenEngine(engineKey: string): boolean {
  return engineKey === "heygen_avatar_iv";
}

/**
 * HeyGen engine configuration — exposed for /api/engines and admin.
 */
export const HEYGEN_ENGINE = {
  key: "heygen_avatar_iv",
  label: "Avatar IV (HeyGen)",
  desc: "Talking avatar • full body • 1080p",
  gate: "premium" as const,
  supportsRefs: false,
  supportsI2v: false,
  maxDuration: 1200, // 20 minutes
  minDuration: 5,
  quality: "1080p",
  costPerMinute: 3.0, // $3/min at 1080p
};
