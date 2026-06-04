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

const HEYGEN_API_V2 = "https://api.heygen.com/v2";
const HEYGEN_API_V3 = "https://api.heygen.com/v3";

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY not configured");
  return key.trim();
}

/**
 * Split a script into chunks that each fit within a single Avatar Shots clip
 * (~15s). Splits on sentence boundaries, accumulating until a word budget is
 * reached. ~2.5 words/sec → ~33 words ≈ 13s, leaving headroom under the 15s cap.
 *
 * Used for multi-scene cinematic: each chunk becomes one shot, then all shots
 * are concatenated into a longer, naturally-paced video.
 */
export function splitScriptIntoChunks(
  text: string,
  maxWordsPerChunk = 33,
  maxChunks = 8
): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [];

  // Split into sentences (keep terminal punctuation)
  const sentences = clean.match(/[^.!?]+[.!?]*\s*/g) ?? [clean];

  const chunks: string[] = [];
  let current = "";
  let currentWords = 0;

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const words = sentence.split(/\s+/).length;

    // A single sentence longer than the budget becomes its own chunk
    if (words > maxWordsPerChunk) {
      if (current) {
        chunks.push(current.trim());
        current = "";
        currentWords = 0;
      }
      chunks.push(sentence);
      continue;
    }

    if (currentWords + words > maxWordsPerChunk && current) {
      chunks.push(current.trim());
      current = sentence;
      currentWords = words;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
      currentWords += words;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Cap total chunks (cost + maxDuration guard). Merge overflow into the last.
  if (chunks.length > maxChunks) {
    const head = chunks.slice(0, maxChunks - 1);
    const tail = chunks.slice(maxChunks - 1).join(" ");
    return [...head, tail];
  }
  return chunks;
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
 * Uses POST /v3/avatars (type: "photo"). Returns the look-level avatar_id
 * (avatar_item.id) to use in video creation.
 */
export async function createPhotoAvatar(
  params: CreatePhotoAvatarParams
): Promise<PhotoAvatar> {
  const res = await fetch(`${HEYGEN_API_V3}/avatars`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "photo",
      name: params.name ?? "AlphoGen Avatar",
      file: { type: "url", url: params.imageUrl },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`HeyGen createPhotoAvatar failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const d = data.data ?? data;
  const avatarId =
    d.avatar_item?.id ??
    d.avatar_id ??
    d.id ??
    d.photo_avatar_id;

  if (!avatarId) {
    throw new Error(
      `HeyGen returned no avatar_id: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  return {
    avatarId: String(avatarId),
    status: String(d.avatar_item?.status ?? d.status ?? "created"),
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
  /** "avatar" = studio/instant avatar (v3 avatar_id) ; "talking_photo" =
   *  photo avatar (talking_photo_id). Drives the correct generation payload. */
  kind: "avatar" | "talking_photo";
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
  const root = data.data ?? data;
  const avatars: Record<string, unknown>[] = root.avatars ?? [];
  // HeyGen returns the account's photo avatars in a SEPARATE array — these are
  // always custom (no stock entries), so surface every one of them.
  const talkingPhotos: Record<string, unknown>[] = root.talking_photos ?? [];

  const fromAvatars: HeyGenAvatar[] = avatars.map((a) => ({
    avatarId: String(a.avatar_id ?? a.id ?? ""),
    name: String(a.avatar_name ?? a.name ?? ""),
    gender: String(a.gender ?? ""),
    previewUrl: (a.preview_image_url as string) ?? null,
    kind: "avatar" as const,
  }));

  const fromTalkingPhotos: HeyGenAvatar[] = talkingPhotos.map((t) => ({
    avatarId: String(t.talking_photo_id ?? t.id ?? ""),
    name: String(t.talking_photo_name ?? t.name ?? ""),
    gender: String(t.gender ?? ""),
    previewUrl: (t.preview_image_url as string) ?? null,
    kind: "talking_photo" as const,
  }));

  return [...fromAvatars, ...fromTalkingPhotos].filter((a) => a.avatarId);
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
  /** Aspect ratio: "16:9" | "9:16" | "1:1" (default "16:9") */
  aspectRatio?: string;
  /** Resolution: "720p" | "1080p" | "4k" (default "1080p") */
  resolution?: string;
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
  // Correct v3 schema: top-level `script` (string) + `voice_id`, engine avatar_iv
  const body: Record<string, unknown> = {
    type: "avatar",
    avatar_id: params.avatarId,
    script: params.scriptText,
    voice_id: params.voiceId,
    engine: { type: "avatar_iv" },
    resolution: params.resolution ?? "1080p",
    aspect_ratio: params.aspectRatio ?? "16:9",
  };

  console.log(
    `[heygen] avatar-iv request: ${JSON.stringify(body).slice(0, 300)}`
  );

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
// Avatar Shots (Seedance 2 — cinematic + lip-sync)
// ---------------------------------------------------------------------------

export interface CreateAvatarShotsParams {
  /** Photo avatar ID */
  avatarId: string;
  /** Director's brief — scene, camera movement, action, setting */
  scenePrompt: string;
  /** Dialogue the avatar speaks (enables frame-accurate lip-sync) */
  scriptText?: string;
  /** Voice ID (required when scriptText is set for lip-sync) */
  voiceId?: string;
  /** Duration in seconds — HeyGen supports 5, 10, or 15 */
  durationSeconds?: number;
  /** Resolution: "720p" | "1080p" */
  resolution?: string;
  /** Aspect ratio: "16:9" | "9:16" */
  aspectRatio?: string;
  /** Reference image URL (e.g., a frame of the first shot) to keep the same
   *  outfit / decor / character across shots for consistency. */
  referenceImageUrl?: string;
}

export interface SpeechResult {
  audioUrl: string;
  /** Duration of the generated audio in seconds (if returned by the API) */
  durationSeconds: number | null;
}

/**
 * Generate TTS speech from text using a HeyGen voice (Starfish engine).
 * Returns the audio URL + duration. Used to drive lip-sync in Avatar Shots
 * with the user's cloned voice (passed as an audio reference), and to size
 * the cinematic shot duration to the actual speech length (natural pacing).
 */
export async function generateSpeech(
  text: string,
  voiceId: string
): Promise<SpeechResult | null> {
  try {
    const res = await fetch(`${HEYGEN_API_V3}/voices/speech`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ text, voice_id: voiceId }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[heygen] generateSpeech failed (${res.status})`);
      return null;
    }
    const data = await res.json();
    const d = data.data ?? data;
    const url = d.audio_url ?? d.url;
    if (!url) return null;
    const rawDur =
      d.duration ?? d.duration_ms ?? d.audio_duration ?? d.length ?? null;
    let durationSeconds: number | null = null;
    if (typeof rawDur === "number") {
      // Heuristic: values > 1000 are almost certainly milliseconds
      durationSeconds = rawDur > 1000 ? rawDur / 1000 : rawDur;
    }
    return { audioUrl: String(url), durationSeconds };
  } catch (e) {
    console.warn("[heygen] generateSpeech error:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Generate an Avatar Shots video (Seedance 2.0 cinematic).
 * Per the v3 API, avatar_shots has NO script/voice fields — motion and
 * speech are driven by the prompt and supplied references. To get lip-sync
 * with a specific voice, generate TTS audio first and pass it as an audio
 * reference (the caller does this and passes audioReferenceUrl).
 *
 * Cost: 4 credits/sec (720p) or 10 credits/sec (1080p).
 */
export async function createAvatarShotsVideo(
  params: CreateAvatarShotsParams & { audioReferenceUrl?: string }
): Promise<AvatarVideoTask> {
  // Duration: integer 4–15 (HeyGen). Snap & clamp.
  const requested = params.durationSeconds ?? 10;
  const duration = Math.max(4, Math.min(15, Math.round(requested)));

  // Build the prompt: scene brief, plus inline dialogue if no audio reference
  let prompt = params.scenePrompt;
  if (params.scriptText && !params.audioReferenceUrl) {
    // No cloned-voice audio → embed dialogue so the model speaks + lip-syncs
    prompt += `\n\nThe person speaks this line, lip-synced: "${params.scriptText}"`;
  }

  const body: Record<string, unknown> = {
    type: "avatar_shots",
    // avatar_id MUST be an array of 1–3 look IDs
    avatar_id: [params.avatarId],
    prompt,
    duration,
    resolution: params.resolution ?? "1080p",
    aspect_ratio: params.aspectRatio === "9:16" ? "9:16" : "16:9",
    enhance_prompt: true,
  };

  // References: audio (drives speech) and/or an image (keeps outfit/decor
  // consistent across shots).
  const refs: Array<Record<string, string>> = [];
  if (params.audioReferenceUrl) refs.push({ type: "url", url: params.audioReferenceUrl });
  if (params.referenceImageUrl) refs.push({ type: "url", url: params.referenceImageUrl });
  if (refs.length > 0) body.references = refs;

  console.log(
    `[heygen] avatar-shots request: avatar=${params.avatarId} ` +
      `duration=${duration}s audioRef=${Boolean(params.audioReferenceUrl)} ` +
      `body=${JSON.stringify(body).slice(0, 400)}`
  );

  const res = await fetch(`${HEYGEN_API_V3}/videos`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`HeyGen createAvatarShots failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const taskId =
    data.data?.video_id ?? data.data?.id ?? data.video_id ?? data.id;

  if (!taskId) {
    throw new Error(
      `HeyGen avatar-shots returned no task ID: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  console.log(`[heygen] avatar-shots task created: ${taskId}`);
  return {
    taskId: String(taskId),
    status: data.data?.status ?? "pending",
  };
}

// ---------------------------------------------------------------------------
// Lipsync — overlay exact speech onto a cinematic video (re-syncs lips)
// ---------------------------------------------------------------------------

/**
 * Create a lipsync job: replaces a video's audio with the given audio and
 * re-animates the speaker's lips to match. This is how we get a cinematic
 * Seedance shot to speak the EXACT script in the user's cloned voice.
 *
 * POST /v3/lipsyncs — returns a lipsync_id to poll via getLipsyncTask().
 */
export async function createLipsync(
  videoUrl: string,
  audioUrl: string,
  mode: "speed" | "precision" = "precision",
  /** Clip the source video to this length (seconds) so it matches the audio
   *  — needed when reusing a fixed-duration Look with a shorter script. */
  endTimeSeconds?: number
): Promise<string> {
  const body: Record<string, unknown> = {
    video: { type: "url", url: videoUrl },
    audio: { type: "url", url: audioUrl },
    mode,
    enable_dynamic_duration: true, // fit video length to the speech
    disable_music_track: true,
  };

  // Trim the video to the audio length (lipsync requires audio/video ±15%).
  if (endTimeSeconds && endTimeSeconds > 0) {
    body.start_time = 0;
    body.end_time = Math.round(endTimeSeconds * 100) / 100;
  }

  console.log(`[heygen] lipsync request: video=${videoUrl.slice(0, 60)} audio=${audioUrl.slice(0, 60)}`);

  const res = await fetch(`${HEYGEN_API_V3}/lipsyncs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`HeyGen createLipsync failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const id = data.data?.lipsync_id ?? data.lipsync_id ?? data.data?.id ?? data.id;
  if (!id) {
    throw new Error(
      `HeyGen lipsync returned no id: ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  console.log(`[heygen] lipsync task created: ${id}`);
  return String(id);
}

/** Poll a lipsync job. Reuses the HeyGenTaskResult shape. */
export async function getLipsyncTask(lipsyncId: string): Promise<HeyGenTaskResult> {
  const res = await fetch(`${HEYGEN_API_V3}/lipsyncs/${lipsyncId}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`HeyGen lipsync poll failed (${res.status})`);
  }

  const data = await res.json();
  const d = data.data ?? data;
  const state = String(d.status ?? "unknown").toLowerCase();

  if (["completed", "done", "success"].includes(state)) {
    const videoUrl = d.video_url ?? d.url ?? d.output_url;
    if (!videoUrl) {
      throw new Error("HeyGen lipsync completed but no video URL found");
    }
    return { status: "completed", videoUrl: String(videoUrl) };
  }
  if (["failed", "error", "cancelled"].includes(state)) {
    const error = d.error?.message ?? d.error ?? d.message ?? "Unknown lipsync error";
    return { status: "failed", error: String(error) };
  }
  return {
    status: ["pending", "queued", "waiting"].includes(state) ? "pending" : "processing",
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

/** Returns true if the engine key is any HeyGen avatar engine. */
export function isHeyGenEngine(engineKey: string): boolean {
  return engineKey === "heygen_avatar_iv" || engineKey === "heygen_avatar_shots";
}

/** Returns true if the engine is the cinematic Avatar Shots (Seedance 2) variant. */
export function isHeyGenShotsEngine(engineKey: string): boolean {
  return engineKey === "heygen_avatar_shots";
}

/**
 * HeyGen Avatar IV engine config — exposed for /api/engines and admin.
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

/**
 * HeyGen Avatar Shots (Seedance 2) engine config — cinematic + lip-sync.
 */
export const HEYGEN_SHOTS_ENGINE = {
  key: "heygen_avatar_shots",
  label: "Avatar Shots (Seedance 2)",
  desc: "Cinematic avatar • lip-sync • 1080p",
  gate: "premium" as const,
  supportsRefs: false,
  supportsI2v: false,
  maxDuration: 15, // Seedance shots: 5/10/15s
  minDuration: 5,
  quality: "1080p",
  costPerMinute: 6.0, // ~$0.10/s at 1080p
};
