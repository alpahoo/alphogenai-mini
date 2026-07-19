/**
 * Jogg API client — URL → Video (V1).
 *
 * Jogg is a REST provider for "product URL → ad video". Calls happen directly
 * from Next.js (Vercel) — no Modal, no GPU. Confidential provider name: never
 * expose "Jogg" in public UI (label = "URL to Video"); it is fine in code,
 * logs, admin and DB `engine_used` per the T-102 confidentiality rule.
 *
 * Flow (V1 — the only path shipped):
 *   1. POST /product                     → product_id   (analyse URL, gratuit)
 *   2. POST /create_video_from_product   → product_video_id (async)
 *   3. GET  /product_video/{id}          → poll until success/failed
 *
 * API key: JOGG_API_KEY (Vercel env var). Header: x-api-key.
 * Proven end-to-end in POC (16 juil. 2026) — see docs/decision-books/url-to-video-v1.md.
 *
 * Findings baked in:
 *   - `override_script` is IGNORED on /create_video_from_product (script.style
 *     always regenerates the copy). V1 = auto-generated FR copy (no verbatim).
 *   - No reachable webhook on this account → polling only (cron/jogg-poll).
 *   - `remaining_quota` is NOT a reliable gauge (stays 0 while generating) →
 *     budget-guard is a home-grown daily counter on `jobs`, never this field.
 *   - Output is watermark-free, 9:16 1080×1920.
 */

const JOGG_API = "https://api.jogg.ai/v2";

function apiKey(): string {
  const key = process.env.JOGG_API_KEY;
  if (!key) throw new Error("JOGG_API_KEY not configured");
  return key.trim();
}

function headers(): Record<string, string> {
  return { "x-api-key": apiKey(), "Content-Type": "application/json" };
}

/**
 * Jogg wraps every response as { code, msg, data }. code === 0 means success.
 * Exported for unit testing (see lib/__tests__/jogg-client.test.ts).
 */
export function parseJoggEnvelope(json: unknown, ctx: string): Record<string, unknown> {
  const j = (json ?? {}) as Record<string, unknown>;
  const code = j.code;
  if (code !== undefined && code !== null && code !== 0) {
    const msg = (j.msg as string) || (j.message as string) || "unknown error";
    throw new Error(`Jogg ${ctx} rejected (code ${code}): ${msg}`);
  }
  return (j.data as Record<string, unknown>) ?? j;
}

// ---------------------------------------------------------------------------
// 1) URL → product
// ---------------------------------------------------------------------------

/**
 * Analyse a product URL. Free step. Returns the Jogg product_id needed by
 * createVideoFromProduct. Product analysis can take ~10-30s.
 */
export async function createProductFromUrl(
  url: string,
  targetAudience?: string,
): Promise<string> {
  const res = await fetch(`${JOGG_API}/product`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(
      targetAudience ? { url, target_audience: targetAudience } : { url },
    ),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Jogg /product failed (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = parseJoggEnvelope(await res.json(), "/product");
  const productId = data.product_id;
  if (!productId) {
    throw new Error("Jogg /product returned no product_id");
  }
  return String(productId);
}

// ---------------------------------------------------------------------------
// 2) product → video (async)
// ---------------------------------------------------------------------------

export interface CreateVideoParams {
  productId: string;
  /** Jogg script style (mandatory server-side). Default "Discovery". */
  style?: string;
  /** Narration language. Default "french". */
  language?: string;
  /** "portrait" (9:16) | "landscape" (16:9) | "square". Default "portrait". */
  aspectRatio?: string;
  /** Target length hint (not strict): "15" | "30" | "60". Default "30". */
  length?: string;
  /** Burn captions. Default true. */
  caption?: boolean;
  /** Public/custom avatar id. Defaults to a public avatar matching the format. */
  avatarId?: number;
  /** 0 = public avatar, 1 = custom/photo avatar. Default 0. */
  avatarType?: 0 | 1;
  /** Optional voice from GET /voices. */
  voiceId?: string;
  /** Optional background music id (from GET /musics). */
  musicId?: string;
}

export type JoggAspectRatio = "portrait" | "landscape" | "square";

const DEFAULT_AVATAR_IDS: Record<JoggAspectRatio, number> = {
  portrait: 1768,
  landscape: 1756,
  square: 204,
};

export function normalizeJoggAvatarAspectRatio(value: unknown): JoggAspectRatio | null {
  if (value === 0 || value === "0" || value === "portrait") return "portrait";
  if (value === 1 || value === "1" || value === "landscape") return "landscape";
  if (value === 2 || value === "2" || value === "square") return "square";
  return null;
}

/**
 * Submit a video generation from a product_id. Returns product_video_id (poll
 * it via getProductVideo). Consumes ~1 Jogg credit.
 *
 * NOTE: no `override_script` — it is silently ignored by Jogg; the copy is
 * written by `script.style`. V1 intentionally uses Jogg's auto-generated copy.
 */
export async function createVideoFromProduct(
  params: CreateVideoParams,
): Promise<string> {
  const aspectRatio = normalizeJoggAvatarAspectRatio(params.aspectRatio) ?? "portrait";
  const body: Record<string, unknown> = {
    product_id: params.productId,
    video_spec: {
      aspect_ratio: aspectRatio,
      length: params.length ?? "30",
      caption: params.caption ?? true,
    },
    avatar: {
      id: params.avatarId ?? DEFAULT_AVATAR_IDS[aspectRatio],
      type: params.avatarType ?? 0,
    },
    script: { style: params.style ?? "Discovery", language: params.language ?? "french" },
  };
  if (params.voiceId) body.voice = { id: params.voiceId };
  if (params.musicId) body.audio = { music_id: params.musicId };

  const res = await fetch(`${JOGG_API}/create_video_from_product`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(
      `Jogg /create_video_from_product failed (${res.status}): ${err.slice(0, 200)}`,
    );
  }
  const data = parseJoggEnvelope(await res.json(), "/create_video_from_product");
  const videoId = data.product_video_id ?? data.video_id;
  if (!videoId) {
    throw new Error("Jogg /create_video_from_product returned no product_video_id");
  }
  return String(videoId);
}

// ---------------------------------------------------------------------------
// 3) poll
// ---------------------------------------------------------------------------

export type JoggStatus = "pending" | "processing" | "completed" | "failed";

export interface JoggVideoResult {
  status: JoggStatus;
  videoUrl?: string;
  error?: string;
}

/**
 * Classify a Jogg product-video `data` payload into a JoggVideoResult.
 * Pure — exported for unit testing (see lib/__tests__/jogg-client.test.ts).
 * Throws if a terminal "completed" state carries no video_url.
 */
export function parseProductVideo(data: Record<string, unknown>): JoggVideoResult {
  const state = String(data.status ?? "").toLowerCase();
  const videoUrl = (data.video_url as string | undefined) || undefined;

  if (videoUrl || ["completed", "success", "succeeded", "done", "finished"].includes(state)) {
    if (!videoUrl) {
      throw new Error(`Jogg video reports "${state}" but no video_url yet`);
    }
    return { status: "completed", videoUrl };
  }

  if (["failed", "fail", "error", "cancelled", "canceled"].includes(state)) {
    const error =
      (data.error_message as string) ||
      (data.msg as string) ||
      (data.message as string) ||
      "Jogg generation failed";
    return { status: "failed", error };
  }

  return { status: state === "pending" || state === "queued" ? "pending" : "processing" };
}

/**
 * Poll a product video. Free step. Called from the cron poller (jogg-poll).
 */
export async function getProductVideo(productVideoId: string): Promise<JoggVideoResult> {
  const res = await fetch(`${JOGG_API}/product_video/${productVideoId}`, {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Jogg /product_video poll failed (${res.status})`);
  }
  return parseProductVideo(parseJoggEnvelope(await res.json(), "/product_video"));
}

// ---------------------------------------------------------------------------
// Presenters (avatars) — for the Product Ad customization picker
// ---------------------------------------------------------------------------

export type JoggAvatarKind = "public" | "custom" | "photo";

export interface JoggAvatar {
  id: number;
  name: string;
  gender: string;
  thumbUrl: string | null;
  type: 0 | 1;
  kind: JoggAvatarKind;
  aspectRatio: JoggAspectRatio | null;
}

export interface JoggVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
  previewUrl: string | null;
}

async function listAvatarCollection(
  path: string,
  kind: JoggAvatarKind,
  pageSize: number,
): Promise<JoggAvatar[]> {
  const query = new URLSearchParams({ page: "1", page_size: String(pageSize) });
  const res = await fetch(`${JOGG_API}${path}?${query}`, {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Avatar catalog failed (${res.status})`);
  const data = parseJoggEnvelope(await res.json(), "avatar catalog");
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data.avatars)
      ? data.avatars
      : Array.isArray(data.list)
        ? data.list
        : [];

  return (raw as Record<string, unknown>[])
    .filter((avatar) => {
      if (kind === "public") return true;
      const status = String(avatar.avatar_status ?? avatar.status ?? "").toLowerCase();
      return status === "1" || status === "completed" || status === "success";
    })
    .map((avatar) => ({
      id: Number(avatar.id),
      name: String(avatar.name ?? "Presenter"),
      gender: String(avatar.gender ?? ""),
      thumbUrl:
        (avatar.cover_url as string) ||
        (avatar.image_url as string) ||
        (avatar.video_url as string) ||
        null,
      type: (kind === "public" ? 0 : 1) as 0 | 1,
      kind,
      aspectRatio:
        kind === "public"
          ? normalizeJoggAvatarAspectRatio(avatar.aspect_ratio)
          : "portrait",
    }))
    .filter((avatar) => Number.isFinite(avatar.id));
}

/**
 * List public presenters (avatars). Free read. Used by the Product Ad
 * customization step so the user picks who presents the ad (fixes "always
 * the same person"). Provider name is never exposed to the UI.
 */
export async function listPublicAvatars(): Promise<JoggAvatar[]> {
  return listAvatarCollection("/avatars/public", "public", 16);
}

export async function listCustomAvatars(): Promise<JoggAvatar[]> {
  return listAvatarCollection("/avatars/custom", "custom", 50);
}

export async function listPhotoAvatars(): Promise<JoggAvatar[]> {
  return listAvatarCollection("/avatars/photo_avatars", "photo", 50);
}

export async function listVoices(): Promise<JoggVoice[]> {
  const query = new URLSearchParams({ page: "1", page_size: "100" });
  const res = await fetch(`${JOGG_API}/voices?${query}`, {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Voice catalog failed (${res.status})`);
  const data = parseJoggEnvelope(await res.json(), "voice catalog");
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data.voices)
      ? data.voices
      : [];
  return (raw as Record<string, unknown>[])
    .map((voice) => ({
      id: String(voice.voice_id ?? ""),
      name: String(voice.name ?? "Voice"),
      language: String(voice.language ?? ""),
      gender: String(voice.gender ?? ""),
      previewUrl: (voice.audio_url as string) || null,
    }))
    .filter((voice) => voice.id.length > 0);
}

// ---------------------------------------------------------------------------
// Account presenter creation (private likeness -> animated photo avatar)
// ---------------------------------------------------------------------------

export interface CreatePhotoAvatarMotionParams {
  photoId: string;
  imageUrl: string;
  name: string;
  voiceId: string;
  model?: "1.0" | "2.0" | "2.0-Pro" | "3.0";
}

export interface JoggPhotoAvatarMotion {
  status: JoggStatus;
  avatarId?: string;
  motionId?: string;
  error?: string;
}

export interface GeneratePhotoAvatarParams {
  imageUrl: string;
  gender: "Female" | "Male";
  age?: "Teenager" | "Young adult" | "Adult" | "Elderly";
  avatarStyle?: "Professional" | "Social";
  model?: "classic" | "modern";
  aspectRatio?: "portrait" | "landscape" | "square";
}

export interface JoggPhotoAvatarGeneration {
  status: JoggStatus;
  photoId: string;
  imageUrls: string[];
  error?: string;
}

export interface UploadJoggAssetParams {
  sourceUrl: string;
  filename: string;
  contentType?: string;
}

/**
 * Copy one private, normalized presenter portrait into the provider's asset
 * storage before asking the motion API to read it. The motion endpoint is
 * unreliable with expiring third-party signed URLs; its own permanent
 * asset_url is the documented input path.
 */
export async function uploadJoggAsset(
  params: UploadJoggAssetParams,
): Promise<string> {
  const contentType = params.contentType ?? "image/jpeg";
  const source = await fetch(params.sourceUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!source.ok) {
    throw new Error(`Presenter portrait download failed (${source.status})`);
  }
  const bytes = await source.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error("Presenter portrait has an invalid file size");
  }

  const reservation = await fetch(`${JOGG_API}/upload/asset`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filename: params.filename,
      content_type: contentType,
      file_size: bytes.byteLength,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!reservation.ok) {
    const body = await reservation.text().catch(() => reservation.statusText);
    throw new Error(`Presenter asset reservation failed (${reservation.status}): ${body.slice(0, 200)}`);
  }
  const data = parseJoggEnvelope(await reservation.json(), "presenter asset upload");
  const signUrl = typeof data.sign_url === "string" ? data.sign_url : "";
  const assetUrl = typeof data.asset_url === "string" ? data.asset_url : "";
  if (!signUrl || !assetUrl) {
    throw new Error("Presenter asset upload returned incomplete URLs");
  }

  const upload = await fetch(signUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!upload.ok) {
    throw new Error(`Presenter asset transfer failed (${upload.status})`);
  }
  return assetUrl;
}

export function parsePhotoAvatarGeneration(
  data: Record<string, unknown>,
): JoggPhotoAvatarGeneration {
  const photoId = String(data.photo_id ?? "").trim();
  if (!photoId) throw new Error("Photo avatar generation returned no photo id");
  const rawStatus = String(data.status ?? "").toLowerCase();
  const imageUrls = Array.isArray(data.image_url_list)
    ? data.image_url_list.filter((url): url is string => typeof url === "string" && url.length > 0)
    : [];
  if (["success", "completed", "complete", "done", "ready"].includes(rawStatus)) {
    if (imageUrls.length === 0) {
      throw new Error("Completed photo avatar generation returned no images");
    }
    return { status: "completed", photoId, imageUrls };
  }
  if (["failed", "fail", "error", "cancelled", "canceled"].includes(rawStatus)) {
    return {
      status: "failed",
      photoId,
      imageUrls: [],
      error: String(data.error_message ?? data.message ?? "Photo avatar generation failed"),
    };
  }
  return {
    status: ["pending", "waiting", "queued"].includes(rawStatus) ? "pending" : "processing",
    photoId,
    imageUrls,
  };
}

/** Start the documented photo-avatar workflow before adding optional motion. */
export async function generatePhotoAvatar(
  params: GeneratePhotoAvatarParams,
): Promise<{ photoId: string }> {
  const res = await fetch(`${JOGG_API}/photo_avatar/photo/generate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      age: params.age ?? "Adult",
      avatar_style: params.avatarStyle ?? "Professional",
      gender: params.gender,
      model: params.model ?? "modern",
      aspect_ratio: params.aspectRatio ?? "portrait",
      image_url: params.imageUrl,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Photo avatar generation failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = parseJoggEnvelope(await res.json(), "photo avatar generation");
  const photoId = String(data.photo_id ?? "").trim();
  if (!photoId) throw new Error("Photo avatar generation returned no photo id");
  return { photoId };
}

export async function getPhotoAvatarGeneration(
  photoId: string,
): Promise<JoggPhotoAvatarGeneration> {
  const query = new URLSearchParams({ photo_id: photoId });
  const res = await fetch(`${JOGG_API}/photo_avatar/photo?${query}`, {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Photo avatar status failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return parsePhotoAvatarGeneration(
    parseJoggEnvelope(await res.json(), "photo avatar status"),
  );
}

/** Normalize the provider's photo-avatar status without leaking its shape. */
export function parsePhotoAvatarMotion(
  data: Record<string, unknown>,
): JoggPhotoAvatarMotion {
  const nested =
    data.photo_avatar && typeof data.photo_avatar === "object"
      ? (data.photo_avatar as Record<string, unknown>)
      : data;
  const rawStatus = String(
    nested.status ?? nested.avatar_status ?? data.status ?? "",
  ).toLowerCase();
  const avatarId = nested.avatar_id ?? nested.id ?? data.avatar_id;
  const motionId = nested.motion_id ?? data.motion_id;

  if (
    ["1", "completed", "complete", "success", "succeeded", "done", "ready"].includes(
      rawStatus,
    )
  ) {
    return {
      status: "completed",
      ...(avatarId !== undefined ? { avatarId: String(avatarId) } : {}),
      ...(motionId !== undefined ? { motionId: String(motionId) } : {}),
    };
  }
  if (["-1", "failed", "fail", "error", "cancelled", "canceled"].includes(rawStatus)) {
    return {
      status: "failed",
      error: String(
        nested.error_message ?? nested.message ?? data.message ?? "Presenter creation failed",
      ),
    };
  }
  return {
    status: ["pending", "waiting", "queued", "0"].includes(rawStatus)
      ? "pending"
      : "processing",
    ...(avatarId !== undefined ? { avatarId: String(avatarId) } : {}),
    ...(motionId !== undefined ? { motionId: String(motionId) } : {}),
  };
}

/**
 * Animate one consented portrait. This is the only paid step in the account
 * presenter flow (currently about two presenter-generation credits).
 */
export async function createPhotoAvatarMotion(
  params: CreatePhotoAvatarMotionParams,
): Promise<JoggPhotoAvatarMotion> {
  const res = await fetch(`${JOGG_API}/photo_avatar/add_motion`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      photo_id: params.photoId,
      image_url: params.imageUrl,
      name: params.name,
      voice_id: params.voiceId,
      model: params.model ?? "2.0",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Presenter creation failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const result = parsePhotoAvatarMotion(
    parseJoggEnvelope(await res.json(), "photo avatar motion"),
  );
  if (!result.motionId && result.status !== "completed") {
    throw new Error("Presenter creation returned no task id");
  }
  // The reusable avatar id may only be assigned when the asynchronous motion
  // task completes. Persist the task id now and let the status poll capture it.
  return result;
}

/** Poll one photo-avatar motion task. This read does not consume credits. */
export async function getPhotoAvatarMotion(
  motionId: string,
): Promise<JoggPhotoAvatarMotion> {
  const query = new URLSearchParams({ motion_id: motionId });
  const res = await fetch(`${JOGG_API}/photo_avatar?${query}`, {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Presenter status failed (${res.status})`);
  return parsePhotoAvatarMotion(
    parseJoggEnvelope(await res.json(), "photo avatar status"),
  );
}
