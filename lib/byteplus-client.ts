/**
 * BytePlus ModelArk client — Dreamina-Seedance-2.0 (direct from ByteDance).
 *
 * Same Seedance 2.0 model EvoLink resells, but called directly → no reseller
 * markup, full multimodal references (image/video/audio), native synchronized
 * audio + multi-character dialogue. Async API: create a task, then poll.
 *
 * Docs: https://docs.byteplus.com/en/docs/ModelArk/1520757
 */

import type { ReferencePayload } from "@/lib/types";
import { signReferenceUrl } from "@/lib/r2";

const ARK_BASE =
  process.env.BYTEPLUS_BASE_URL || "https://ark.ap-southeast.bytepluses.com";
const TASKS_URL = `${ARK_BASE}/api/v3/contents/generations/tasks`;

const MAX_REFERENCE_IMAGES = 9;

export interface BytePlusEngineConfig {
  /** ModelArk model id sent in the request body. */
  modelId: string;
  label: string;
  maxDuration: number;
  resolution: "480p" | "720p" | "1080p";
  /** reference-to-video (multi face/character references). 2.0 only — 1.5 Pro
   *  rejects r2v ("task_type r2v does not support model seedance-1-5-pro"). */
  supportsReferences: boolean;
}

/**
 * BytePlus engines. Keys are the AlphoGen EngineKey values; `modelId` is the
 * ModelArk model sent to the API.
 */
export const BYTEPLUS_ENGINES: Record<string, BytePlusEngineConfig> = {
  // Seedance 1.5 Pro — verified working on the account (model id confirmed live).
  // Native synchronized audio (dialogue + SFX), up to 1080p, 4–12s.
  seedance15pro_byteplus: {
    modelId: process.env.BYTEPLUS_SEEDANCE_15PRO_MODEL || "seedance-1-5-pro-251215",
    label: "Seedance 1.5 Pro · 1080p (Direct)",
    maxDuration: 12,
    resolution: "1080p",
    supportsReferences: false, // 1.5 Pro: t2v / i2v only (no r2v)
  },
  seedance15pro_720p_byteplus: {
    modelId: process.env.BYTEPLUS_SEEDANCE_15PRO_MODEL || "seedance-1-5-pro-251215",
    label: "Seedance 1.5 Pro · 720p (Direct)",
    maxDuration: 12,
    resolution: "720p",
    supportsReferences: false,
  },
  // Seedance 2.0 — region-gated on some accounts (needs Safe Experience Mode off).
  seedance2_byteplus: {
    modelId: process.env.BYTEPLUS_SEEDANCE_MODEL || "dreamina-seedance-2-0-260128",
    label: "Seedance 2.0 (Direct)",
    maxDuration: 15,
    resolution: "1080p",
    supportsReferences: true, // 2.0 supports reference-to-video
  },
  seedance2_fast_byteplus: {
    modelId:
      process.env.BYTEPLUS_SEEDANCE_FAST_MODEL || "dreamina-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast (Direct)",
    maxDuration: 15,
    resolution: "720p",
    supportsReferences: true,
  },
};

export function isBytePlusEngine(engineKey: string): boolean {
  return engineKey in BYTEPLUS_ENGINES;
}

export function isBytePlusConfigured(): boolean {
  return Boolean(process.env.BYTEPLUS_ARK_API_KEY);
}

function authHeaders(): Record<string, string> {
  const key = process.env.BYTEPLUS_ARK_API_KEY;
  if (!key) throw new Error("BYTEPLUS_ARK_API_KEY not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/** Resolve a reference item to a usable URL (signed if it has a storage_path). */
async function resolveRefUrl(item: {
  url?: string;
  storage_path?: string;
}): Promise<string | null> {
  try {
    if (typeof item.storage_path === "string" && item.storage_path.length > 0) {
      return await signReferenceUrl(item.storage_path);
    }
    if (typeof item.url === "string" && item.url.startsWith("http")) return item.url;
  } catch {
    /* fall through */
  }
  return null;
}

export interface CreateBytePlusParams {
  engineKey: string;
  prompt: string;
  duration: number;
  /** First-frame image (I2V). */
  imageUrl?: string;
  aspectRatio?: string;
  /** Multi-reference payload (character faces / style images). */
  references?: ReferencePayload | null;
  /** Verified BytePlus real-human asset IDs (asset-...). Referenced as
   *  asset://<id> reference_image, in order → "image 1", "image 2" in the prompt.
   *  2.0 only (reference-to-video). */
  assetIds?: string[];
  /** Whether the model should generate native audio (multi-char dialogue). */
  generateAudio?: boolean;
}

/**
 * Create a Seedance 2.0 generation task. Returns the provider task id to poll.
 */
export async function createBytePlusTask(params: CreateBytePlusParams): Promise<string> {
  const config = BYTEPLUS_ENGINES[params.engineKey];
  if (!config) throw new Error(`Unknown BytePlus engine: ${params.engineKey}`);

  const duration = Math.max(4, Math.min(config.maxDuration, Math.round(params.duration || 5)));

  // Build the multimodal content array: prompt text + images.
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: params.prompt.slice(0, 5000) },
  ];

  // Resolve reference images first.
  const refImages = params.references?.images;
  const refUrls: string[] = [];
  if (Array.isArray(refImages) && refImages.length > 0) {
    const resolved = await Promise.all(
      refImages.slice(0, MAX_REFERENCE_IMAGES).map((r) => resolveRefUrl(r))
    );
    for (const url of resolved) if (url) refUrls.push(url);
  }
  const firstFrame =
    params.imageUrl && params.imageUrl.startsWith("http") ? params.imageUrl : undefined;

  // Image handling depends on the model's capabilities:
  //  - 2.0 (supportsReferences) → reference-to-video: ALL images as
  //    reference_image (BytePlus forbids mixing first/last frame with reference).
  //  - 1.5 Pro (no r2v) → image-to-video: a SINGLE first frame only. If the user
  //    supplied references, use the first one as the start frame (best effort).
  // Verified real-human asset URIs (asset://<id>) — these come FIRST so they
  // map predictably to "image 1", "image 2"… in the prompt.
  const assetUris = (params.assetIds ?? [])
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .map((id) => (id.startsWith("asset://") ? id : `asset://${id}`));

  if (config.supportsReferences) {
    // 2.0 reference-to-video: verified face assets first, then any raw refs.
    // (BytePlus forbids mixing first/last frame with reference, so the start
    // image is sent as a reference too.)
    for (const uri of assetUris) {
      content.push({ type: "image_url", image_url: { url: uri }, role: "reference_image" });
    }
    if (firstFrame) {
      content.push({ type: "image_url", image_url: { url: firstFrame }, role: "reference_image" });
    }
    for (const url of refUrls) {
      content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    }
  } else {
    // 1.5 Pro (no r2v): image-to-video from an explicit start frame only.
    // Verified assets + face refs can't be consumed by this model → dropped.
    if (firstFrame) {
      content.push({ type: "image_url", image_url: { url: firstFrame }, role: "first_frame" });
    }
    if (assetUris.length > 0 || refUrls.length > 0) {
      console.warn(
        `[byteplus] ${params.engineKey} has no reference-to-video; dropping ` +
          `${assetUris.length} asset + ${refUrls.length} reference image(s). Use Seedance 2.0.`
      );
    }
  }

  const body = {
    model: config.modelId,
    content,
    ratio: params.aspectRatio && ["16:9", "9:16", "1:1"].includes(params.aspectRatio)
      ? params.aspectRatio
      : "16:9",
    resolution: config.resolution,
    duration,
    generate_audio: params.generateAudio ?? true,
    return_last_frame: true,
  };

  console.log(
    `[byteplus] create task engine=${params.engineKey} model=${config.modelId} ` +
      `dur=${duration}s refs=${content.length - 1} audio=${body.generate_audio}`
  );

  const res = await fetch(TASKS_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`BytePlus create task failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const taskId = data.task_id ?? data.id ?? data.data?.task_id ?? data.data?.id;
  if (!taskId) {
    throw new Error(`BytePlus returned no task id: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return String(taskId);
}

export interface BytePlusTaskResult {
  /** Normalised to the poller's vocabulary: completed | failed | processing. */
  status: "completed" | "failed" | "processing";
  videoUrl?: string;
  lastFrameUrl?: string;
  error?: string;
  /** Real tokens consumed, if the API reports usage (surgical actual cost). */
  tokens?: number;
}

/** Poll a Seedance 2.0 task. */
export async function getBytePlusTask(taskId: string): Promise<BytePlusTaskResult> {
  const res = await fetch(`${TASKS_URL}/${encodeURIComponent(taskId)}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`BytePlus get task failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const d = data.data ?? data;
  const raw = String(d.status ?? "").toLowerCase();
  const videoUrl = d.content?.video_url ?? d.video_url ?? undefined;
  const lastFrameUrl = d.content?.last_frame_url ?? d.last_frame_url ?? undefined;
  // Real token usage, if reported (field name varies across API versions).
  const u = d.usage ?? data.usage ?? {};
  const tokens =
    Number(u.total_tokens ?? u.tokens ?? u.output_tokens ?? u.completion_tokens) || undefined;

  if (raw === "succeeded" && videoUrl) {
    if (tokens) console.log(`[byteplus] task done: ${tokens} tokens used`);
    return { status: "completed", videoUrl, lastFrameUrl, tokens };
  }
  if (["failed", "expired", "cancelled", "canceled"].includes(raw)) {
    return {
      status: "failed",
      error: d.error?.message ?? d.error?.code ?? `task ${raw}`,
    };
  }
  return { status: "processing" };
}
