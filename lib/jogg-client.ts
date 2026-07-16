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

/** Default public avatar used in the winning POC ("Autumn"). Overridable. */
const DEFAULT_AVATAR_ID = 1768;

function apiKey(): string {
  const key = process.env.JOGG_API_KEY;
  if (!key) throw new Error("JOGG_API_KEY not configured");
  return key.trim();
}

function headers(): Record<string, string> {
  return { "x-api-key": apiKey(), "Content-Type": "application/json" };
}

/** Jogg wraps every response as { code, msg, data }. code === 0 means success. */
function unwrap(json: unknown, ctx: string): Record<string, unknown> {
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
  const data = unwrap(await res.json(), "/product");
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
  /** Public/custom avatar id. Default DEFAULT_AVATAR_ID (Autumn). */
  avatarId?: number;
  /** Optional background music id (from GET /musics). */
  musicId?: string;
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
  const body: Record<string, unknown> = {
    product_id: params.productId,
    video_spec: {
      aspect_ratio: params.aspectRatio ?? "portrait",
      length: params.length ?? "30",
      caption: params.caption ?? true,
    },
    avatar: { id: params.avatarId ?? DEFAULT_AVATAR_ID, type: 0 },
    script: { style: params.style ?? "Discovery", language: params.language ?? "french" },
  };
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
  const data = unwrap(await res.json(), "/create_video_from_product");
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
  const data = unwrap(await res.json(), "/product_video");

  const state = String(data.status ?? "").toLowerCase();
  const videoUrl = (data.video_url as string | undefined) || undefined;

  if (videoUrl || ["completed", "success", "succeeded", "done", "finished"].includes(state)) {
    if (!videoUrl) {
      throw new Error(
        `Jogg video ${productVideoId} reports "${state}" but no video_url yet`,
      );
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
