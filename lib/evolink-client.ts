/**
 * EvoLink unified API client — Next.js (Vercel) side.
 *
 * EvoLink is a REST gateway to multiple video generation models.
 * Calls happen directly from Next.js — no Modal, no cold start.
 *
 * Flow:
 *   1. POST /v1/videos/generations  →  task_id
 *   2. GET  /v1/tasks/{task_id}      →  poll until completed/failed
 *
 * API key: EVOLINK_API_KEY (Vercel env var)
 * Docs: https://docs.evolink.ai
 */

import { signReferenceUrl } from "@/lib/r2";
import type { ReferencePayload, ReferenceItem } from "@/lib/types";

const EVOLINK_API = "https://api.evolink.ai/v1";

// V1 Multi-Reference cap — Kie.ai / EvoLink reference variants accept up to
// 9 reference images. Anything past 9 would be rejected by the provider.
const MAX_REFERENCE_IMAGES = 9;

// ---------------------------------------------------------------------------
// LLM API (OpenAI-compatible) — same API key, different endpoint
// ---------------------------------------------------------------------------

/**
 * Call EvoLink's OpenAI-compatible chat completions endpoint.
 * Used for prompt enhancement, metadata generation, storyboard LLM, etc.
 *
 * Default model: deepseek-chat (~$0.07/1M tokens — very cheap for short prompts)
 * Alternatives: "gemini-3.1-flash-lite-preview" (even cheaper), "claude-sonnet-4-6"
 */
export async function callEvoLinkLLM(
  systemPrompt: string,
  userMessage: string,
  model = "deepseek-chat"
): Promise<string> {
  const apiKey = process.env.EVOLINK_API_KEY;
  if (!apiKey) throw new Error("EVOLINK_API_KEY not configured");

  const res = await fetch(`${EVOLINK_API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(8000), // 8s max — never block job creation
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`EvoLink LLM failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content as string | undefined;
  if (!content) throw new Error("EvoLink LLM returned empty content");
  return content.trim();
}

// ---------------------------------------------------------------------------
// Engine registry — maps our engine keys to EvoLink model IDs
// ---------------------------------------------------------------------------

export interface EvoLinkEngineConfig {
  /** EvoLink model ID for text-to-video */
  model: string;
  /** EvoLink model ID for image-to-video (if image_url provided) */
  imageModel?: string;
  /** EvoLink model ID for reference-to-video (when reference_image_urls present) */
  referenceModel?: string;
  /** Max supported duration in seconds */
  maxDuration: number;
  /** Min supported duration in seconds (some models require e.g. 6s) */
  minDuration?: number;
  /** Video quality (default "720p") */
  quality?: string;
  /** Display label */
  label: string;
  /** Short description for the UI */
  desc: string;
  /** Plans allowed (mirrors backend plan gate) */
  plans: Array<"free" | "pro" | "premium">;
}

export const EVOLINK_ENGINES: Record<string, EvoLinkEngineConfig> = {
  // ── Seedance ───────────────────────────────────────────────────────────────
  evolink: {
    model: "seedance-2.0-text-to-video",
    imageModel: "seedance-2.0-image-to-video",
    referenceModel: "seedance-2.0-reference-to-video",
    maxDuration: 15,
    label: "Seedance 2.0",
    desc: "EvoLink • 720p • up to 15s",
    plans: ["pro", "premium"],
  },
  evolink_fast: {
    model: "seedance-2.0-fast-text-to-video",
    imageModel: "seedance-2.0-fast-image-to-video",
    referenceModel: "seedance-2.0-fast-reference-to-video",
    maxDuration: 15,
    label: "Seedance 2.0 Fast",
    desc: "EvoLink • 720p • faster & cheaper",
    plans: ["pro", "premium"],
  },
  // ── Kling ─────────────────────────────────────────────────────────────────
  kling_o3: {
    model: "kling-o3-text-to-video",
    imageModel: "kling-o3-image-to-video",
    referenceModel: "kling-o3-reference-to-video",
    maxDuration: 15,
    label: "Kling O3",
    desc: "EvoLink • 1080p • up to 15s",
    plans: ["pro", "premium"],
  },
  kling_v3: {
    model: "kling-v3-text-to-video",
    imageModel: "kling-v3-image-to-video",
    maxDuration: 15,
    label: "Kling 3.0",
    desc: "EvoLink • 1080p • latest Kling",
    plans: ["pro", "premium"],
  },
  // ── WAN 2.6 (via EvoLink — no GPU cold start) ─────────────────────────────
  // NOTE: wan2.6-reference-video requires VIDEO input — cannot be used with
  // image-only references. Image refs are passed via image_urls to the I2V model
  // as a fallback (EvoLink ignores unknown fields on non-reference models).
  wan_26: {
    model: "wan2.6-text-to-video",
    imageModel: "wan2.6-image-to-video",
    maxDuration: 15,
    label: "WAN 2.6",
    desc: "EvoLink • 720p • no cold start",
    plans: ["pro", "premium"],
  },
  // ── Happy Horse ────────────────────────────────────────────────────────────
  happy_horse_10: {
    model: "happyhorse-1.0-text-to-video",
    imageModel: "happyhorse-1.0-image-to-video",
    maxDuration: 15,
    label: "Happy Horse 1.0",
    desc: "EvoLink • 720p • cinematic quality",
    plans: ["premium"],
  },
  // ── WAN 2.7 ───────────────────────────────────────────────────────────────
  wan_27: {
    model: "wan2.7-text-to-video",
    imageModel: "wan2.7-image-to-video",
    maxDuration: 10,
    label: "WAN 2.7",
    desc: "EvoLink • 720p • latest WAN",
    plans: ["pro", "premium"],
  },
  // ── Hailuo (MiniMax) ──────────────────────────────────────────────────────
  hailuo: {
    model: "MiniMax-Hailuo-2.3",
    imageModel: "MiniMax-Hailuo-2.3",
    maxDuration: 10,
    minDuration: 6,
    quality: "1080p",
    label: "Hailuo 2.3",
    desc: "EvoLink • 1080p • 6-10s",
    plans: ["pro", "premium"],
  },
  hailuo_fast: {
    model: "MiniMax-Hailuo-2.3-Fast",
    imageModel: "MiniMax-Hailuo-2.3-Fast",
    maxDuration: 10,
    minDuration: 6,
    quality: "1080p",
    label: "Hailuo 2.3 Fast",
    desc: "EvoLink • 1080p • faster",
    plans: ["pro", "premium"],
  },
  // ── Sora 2 ────────────────────────────────────────────────────────────────
  sora_2: {
    model: "sora-2-pro-preview",
    maxDuration: 12,
    quality: "1080p",
    label: "Sora 2 Pro",
    desc: "EvoLink • 1080p • up to 12s",
    plans: ["premium"],
  },
};

/** Returns true if the given engine key is handled by EvoLink (not Modal). */
export function isEvoLinkEngine(engineKey: string): boolean {
  return engineKey in EVOLINK_ENGINES;
}

/**
 * Returns true if the given EvoLink engine supports image-to-video.
 * Used by the multi-scene chaining path: engines without an `imageModel`
 * (e.g. Sora 2) cannot accept a `first_frame_url`, so chaining must
 * fall back to independent sequential generation.
 */
export function engineSupportsFirstFrame(engineKey: string): boolean {
  const cfg = EVOLINK_ENGINES[engineKey];
  return Boolean(cfg?.imageModel);
}

// ---------------------------------------------------------------------------
// Task creation
// ---------------------------------------------------------------------------

export interface CreateTaskParams {
  engineKey: string;
  prompt: string;
  duration: number;
  imageUrl?: string;
  /**
   * V1 Multi-Reference: structured reference payload (images only — videos
   * and audio are out of scope for V1 since the private bucket is image-only).
   * Image refs are resolved (signed if `storage_path` present, otherwise the
   * legacy `url` is used directly) and sent as `reference_image_urls[]` —
   * engines that don't support reference-to-video (Sora 2, Kling, Hailuo)
   * silently ignore the field per EvoLink's permissive parser.
   */
  references?: ReferencePayload | null;
}

/**
 * Resolve one ReferenceItem to a URL ready to ship to the provider.
 * Priority: storage_path (sign on-demand, TTL 6h) → legacy `url` → null.
 * Returns null on any error — caller skips the ref + logs a warning.
 *
 * Per future-proof-notes §3.8 — never persist signed URLs; sign on-demand.
 */
async function resolveReferenceUrl(ref: unknown): Promise<string | null> {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Partial<ReferenceItem>;

  // V1 path: signed URL from canonical storage_path
  if (typeof r.storage_path === "string" && r.storage_path.length > 0) {
    try {
      return await signReferenceUrl(r.storage_path, 21600);
    } catch (e) {
      console.warn(
        "[evolink] sign reference failed, skipping:",
        e instanceof Error ? e.message : String(e),
      );
      return null;
    }
  }

  // Legacy V0 fallback: ref.url is an R2 public URL (never expires)
  if (typeof r.url === "string" && r.url.startsWith("http")) {
    return r.url;
  }

  return null;
}

/**
 * Submit a generation task to EvoLink.
 * Returns the task ID (polls via getEvoLinkTask).
 */
export async function createEvoLinkTask(params: CreateTaskParams): Promise<string> {
  const apiKey = process.env.EVOLINK_API_KEY;
  if (!apiKey) throw new Error("EVOLINK_API_KEY not configured");

  const config = EVOLINK_ENGINES[params.engineKey];
  if (!config) throw new Error(`Unknown EvoLink engine: ${params.engineKey}`);

  const minDur = config.minDuration ?? 4;
  const clampedDuration = Math.max(minDur, Math.min(config.maxDuration, params.duration));

  // ── Resolve reference image URLs FIRST (needed for model selection) ────
  // Videos/audio refs are intentionally NOT mapped here — the V1 bucket is
  // image-only. Will be revisited when the bucket allows video/audio types.
  let refImageUrls: string[] = [];
  const refImages = params.references?.images;
  if (Array.isArray(refImages) && refImages.length > 0) {
    // Defense in depth: POST /api/jobs already validates ≤9, but truncate
    // here too in case refs arrive from fireNextScene or future call sites.
    if (refImages.length > MAX_REFERENCE_IMAGES) {
      console.warn(
        `[evolink] truncating ${refImages.length} image refs to ${MAX_REFERENCE_IMAGES} ` +
          `for engine=${params.engineKey} (should have been caught by /api/jobs validation)`,
      );
    }
    const limited = refImages.slice(0, MAX_REFERENCE_IMAGES);
    // Parallel sign — Promise.all keeps latency at ~one round-trip instead of N×
    const resolved = await Promise.all(limited.map(resolveReferenceUrl));
    refImageUrls = resolved.filter((u): u is string => Boolean(u));

    if (refImageUrls.length < limited.length) {
      // Log counts only — never the URLs themselves (PII risk if filename
      // ever leaks into storage_path).
      console.warn(
        `[evolink] references: ${refImageUrls.length}/${limited.length} resolved ` +
          `for engine=${params.engineKey} (others skipped: sign failed or invalid shape)`,
      );
    }
  }

  // ── Model selection (priority: referenceModel > imageModel > model) ────
  // Reference-to-video takes precedence: if we have resolved reference images
  // AND the engine defines a dedicated referenceModel, use it. This is critical
  // because T2V/I2V models do NOT process reference images — only the
  // dedicated reference-to-video variant (Seedance, Kling O3) uses them.
  const useReferenceModel = refImageUrls.length > 0 && Boolean(config.referenceModel);
  let model: string;
  if (useReferenceModel) {
    model = config.referenceModel!;
  } else if (params.imageUrl && config.imageModel) {
    model = config.imageModel;
  } else {
    model = config.model;
  }

  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    duration: clampedDuration,
    quality: config.quality ?? "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
    model_params: { web_search: false },
  };

  // ── Wire images to body based on selected model path ───────────────────
  if (useReferenceModel) {
    // Reference-to-video models (Seedance, Kling O3) use `image_urls` for
    // reference images. If a first-frame imageUrl is also present, include
    // it as the first element so the model uses it as the opening frame.
    const allImages = [
      ...(params.imageUrl ? [params.imageUrl] : []),
      ...refImageUrls,
    ];
    body.image_urls = allImages;
  } else if (params.imageUrl && config.imageModel) {
    // Image-to-video path (no refs, just first frame).
    // EvoLink's I2V engines use different field names:
    //   - Seedance 2.0 / 2.0-fast → `image_urls: [url]`  (array form)
    //   - Kling, WAN, Hailuo      → `first_frame_url: url`  (string form)
    // We send BOTH so the gateway routes correctly regardless of engine —
    // unknown fields are silently ignored by EvoLink's parser.
    body.first_frame_url = params.imageUrl;
    body.image_urls = [params.imageUrl];
  }

  // Engines WITHOUT a referenceModel (WAN 2.6, Hailuo, Sora 2) that still
  // receive refs: pass as `reference_image_urls` — silently ignored by these
  // models (EvoLink permissive parser). This is a best-effort fallback; the
  // user won't get reference-guided output but won't get an error either.
  if (refImageUrls.length > 0 && !useReferenceModel) {
    body.reference_image_urls = refImageUrls;
  }

  console.log(
    `[evolink] createTask: engine=${params.engineKey} model=${model} ` +
    `refs=${refImageUrls.length} imageUrl=${Boolean(params.imageUrl)} ` +
    `duration=${clampedDuration}s`
  );

  const res = await fetch(`${EVOLINK_API}/videos/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`EvoLink create failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const taskId = data.id || data.task_id;
  if (!taskId) {
    throw new Error(`EvoLink returned no task ID. Response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return String(taskId);
}

// ---------------------------------------------------------------------------
// Task status polling
// ---------------------------------------------------------------------------

export type EvoLinkStatus = "pending" | "processing" | "completed" | "failed";

export interface EvoLinkTaskResult {
  status: EvoLinkStatus;
  videoUrl?: string;
  error?: string;
}

/**
 * Check the status of an EvoLink task.
 * Called lazily from GET /api/jobs/[id] on each frontend poll.
 */
export async function getEvoLinkTask(taskId: string): Promise<EvoLinkTaskResult> {
  const apiKey = process.env.EVOLINK_API_KEY;
  if (!apiKey) throw new Error("EVOLINK_API_KEY not configured");

  const res = await fetch(`${EVOLINK_API}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    // No cache — always fresh
    cache: "no-store",
    signal: AbortSignal.timeout(15_000), // 15s max — prevent Vercel 504s
  });

  if (!res.ok) {
    throw new Error(`EvoLink poll failed (${res.status})`);
  }

  const data = await res.json();

  // Support multiple status field names (unified API vs legacy)
  const state: string = (
    (data.status as string) ||
    (data.state as string) ||
    (data.task_status as string) ||
    "unknown"
  ).toLowerCase();

  // ── Terminal: completed ────────────────────────────────────────────────
  if (["completed", "success", "succeed", "succeeded", "done", "finished"].includes(state)) {
    // EvoLink unified API (confirmed format):
    //   { "id": "task-unified-...", "status": "completed", "results": ["https://..."] }
    // Legacy / fallback fields also checked for safety.
    const output: Record<string, unknown> = (data.output as Record<string, unknown>) || {};
    const result: Record<string, unknown> = (data.result as Record<string, unknown>) || {};
    const generations = (data.data as Record<string, unknown>[] | undefined) ?? [];

    const videoUrl =
      // ── PRIMARY: EvoLink unified API ──────────────────────────────────
      ((data.results as string[] | undefined) ?? [])[0] ||
      // ── FALLBACK: other field patterns ────────────────────────────────
      (output.video_url as string | undefined) ||
      (result.video_url as string | undefined) ||
      (data.video_url as string | undefined) ||
      ((output.videos as string[] | undefined) || [])[0] ||
      ((result.videos as string[] | undefined) || [])[0] ||
      (generations[0]?.url as string | undefined) ||
      (generations[0]?.video as string | undefined) ||
      (generations[0]?.video_url as string | undefined);

    if (!videoUrl) {
      // Log the full response so we can diagnose any future format changes
      console.error(
        `[evolink] task ${taskId} completed but no URL found.\n` +
        `Response keys: ${Object.keys(data).join(", ")}\n` +
        `Full: ${JSON.stringify(data).slice(0, 600)}`
      );
      throw new Error(
        `EvoLink task completed but no video URL found. Keys: ${Object.keys(data).join(", ")}`
      );
    }

    console.log(`[evolink] task ${taskId} completed → ${videoUrl.slice(0, 80)}`);
    return { status: "completed", videoUrl };
  }

  // ── Terminal: failed ───────────────────────────────────────────────────
  if (["failed", "fail", "failure", "error", "cancelled", "canceled"].includes(state)) {
    const errData = data.error as Record<string, unknown> | string | undefined;
    const error =
      typeof errData === "string"
        ? errData
        : (errData?.message as string) ||
          (data.error_message as string) ||
          (data.failMsg as string) ||
          (data.message as string) ||
          "Unknown error";

    return { status: "failed", error };
  }

  // ── In progress ────────────────────────────────────────────────────────
  // Log unknown states so we can catch new EvoLink status values in production
  if (!["pending", "processing", "queued", "running", "in_progress"].includes(state)) {
    console.warn(
      `[evolink] task ${taskId} — unknown state "${state}". Full response: ${JSON.stringify(data).slice(0, 400)}`
    );
  }

  return { status: state === "pending" || state === "queued" ? "pending" : "processing" };
}
