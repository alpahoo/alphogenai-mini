/**
 * Atlas Cloud client — Seedance 2.0 (ByteDance) via a unified API.
 *
 * Same Seedance 2.0 model EvoLink resells, ~5x cheaper (≈$0.096/s, fast
 * ≈$0.076/s), with multimodal references + native audio. Async API: create a
 * task, then poll the prediction.
 *
 * Docs: https://www.atlascloud.ai/docs/en
 */

import type { ReferencePayload } from "@/lib/types";
import { signReferenceUrl } from "@/lib/r2";

const ATLAS_BASE = process.env.ATLASCLOUD_BASE_URL || "https://api.atlascloud.ai";
const GENERATE_URL = `${ATLAS_BASE}/api/v1/model/generateVideo`;
const PREDICTION_URL = `${ATLAS_BASE}/api/v1/model/prediction`;

const MAX_REFERENCE_IMAGES = 9;

export interface AtlasEngineConfig {
  /** Base model family on Atlas Cloud; the t2v/i2v/r2v variant is chosen per request. */
  modelBase: string; // e.g. "bytedance/seedance-2.0" or "bytedance/seedance-2.0-fast"
  label: string;
  maxDuration: number;
  resolution: "480p" | "720p" | "1080p";
}

export const ATLAS_ENGINES: Record<string, AtlasEngineConfig> = {
  seedance2_atlas: {
    modelBase: "bytedance/seedance-2.0",
    label: "Seedance 2.0 (Atlas)",
    maxDuration: 15,
    resolution: "1080p",
  },
  seedance2_fast_atlas: {
    modelBase: "bytedance/seedance-2.0-fast",
    label: "Seedance 2.0 Fast (Atlas)",
    maxDuration: 15,
    resolution: "720p",
  },
};

export function isAtlasEngine(engineKey: string): boolean {
  return engineKey in ATLAS_ENGINES;
}

export function isAtlasConfigured(): boolean {
  return Boolean(process.env.ATLASCLOUD_API_KEY);
}

function authHeaders(): Record<string, string> {
  const key = process.env.ATLASCLOUD_API_KEY;
  if (!key) throw new Error("ATLASCLOUD_API_KEY not configured");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function resolveRefUrl(item: { url?: string; storage_path?: string }): Promise<string | null> {
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

export interface CreateAtlasParams {
  engineKey: string;
  prompt: string;
  duration: number;
  imageUrl?: string;
  aspectRatio?: string;
  references?: ReferencePayload | null;
  generateAudio?: boolean;
}

export async function createAtlasTask(params: CreateAtlasParams): Promise<string> {
  const config = ATLAS_ENGINES[params.engineKey];
  if (!config) throw new Error(`Unknown Atlas engine: ${params.engineKey}`);

  const duration = Math.max(4, Math.min(config.maxDuration, Math.round(params.duration || 5)));

  // Collect reference / first-frame images.
  const images: string[] = [];
  if (params.imageUrl && params.imageUrl.startsWith("http")) images.push(params.imageUrl);
  const refImages = params.references?.images;
  if (Array.isArray(refImages) && refImages.length > 0) {
    const resolved = await Promise.all(
      refImages.slice(0, MAX_REFERENCE_IMAGES).map((r) => resolveRefUrl(r))
    );
    for (const url of resolved) if (url) images.push(url);
  }

  // Pick the model variant by input type.
  const variant =
    images.length > 0
      ? params.references?.images?.length
        ? "reference-to-video"
        : "image-to-video"
      : "text-to-video";
  const model = `${config.modelBase}/${variant}`;

  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt.slice(0, 5000),
    duration,
    resolution: config.resolution,
    ratio:
      params.aspectRatio && ["16:9", "9:16", "1:1"].includes(params.aspectRatio)
        ? params.aspectRatio
        : "16:9",
    generate_audio: params.generateAudio ?? true,
    watermark: false,
    return_last_frame: true,
  };
  // Image fields — send both common shapes; the gateway ignores unknown keys.
  if (images.length > 0) {
    body.images = images;
    body.image_urls = images;
  }

  console.log(
    `[atlas] create task model=${model} dur=${duration}s imgs=${images.length} audio=${body.generate_audio}`
  );

  const res = await fetch(GENERATE_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Atlas create task failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const id = data.data?.id ?? data.id ?? data.data?.prediction_id ?? data.prediction_id;
  if (!id) throw new Error(`Atlas returned no prediction id: ${JSON.stringify(data).slice(0, 300)}`);
  return String(id);
}

export interface AtlasTaskResult {
  status: "completed" | "failed" | "processing";
  videoUrl?: string;
  error?: string;
}

export async function getAtlasTask(predictionId: string): Promise<AtlasTaskResult> {
  const res = await fetch(`${PREDICTION_URL}/${encodeURIComponent(predictionId)}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Atlas get prediction failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const d = data.data ?? data;
  const raw = String(d.status ?? "").toLowerCase();
  // Output video: outputs[0] (string or {url}), or common fallbacks.
  const out0 = Array.isArray(d.outputs) ? d.outputs[0] : undefined;
  const videoUrl =
    (typeof out0 === "string" ? out0 : out0?.url) ??
    d.output?.video_url ??
    d.video_url ??
    undefined;

  if ((raw === "completed" || raw === "succeeded") && videoUrl) {
    return { status: "completed", videoUrl: String(videoUrl) };
  }
  if (["failed", "error", "cancelled", "canceled"].includes(raw)) {
    return { status: "failed", error: d.error?.message ?? d.error ?? `task ${raw}` };
  }
  return { status: "processing" };
}
