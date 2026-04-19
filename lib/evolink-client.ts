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

const EVOLINK_API = "https://api.evolink.ai/v1";

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
    maxDuration: 15,
    label: "Seedance 2.0",
    desc: "EvoLink • 720p • up to 15s",
    plans: ["pro", "premium"],
  },
  evolink_fast: {
    model: "seedance-2.0-fast-text-to-video",
    imageModel: "seedance-2.0-fast-image-to-video",
    maxDuration: 15,
    label: "Seedance 2.0 Fast",
    desc: "EvoLink • 720p • faster & cheaper",
    plans: ["pro", "premium"],
  },
  // ── Kling ─────────────────────────────────────────────────────────────────
  kling_o3: {
    model: "kling-o3-text-to-video",
    imageModel: "kling-o3-image-to-video",
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
  wan_26: {
    model: "wan2.6-text-to-video",
    imageModel: "wan2.6-image-to-video",
    maxDuration: 15,
    label: "WAN 2.6",
    desc: "EvoLink • 720p • no cold start",
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

  const model =
    params.imageUrl && config.imageModel ? config.imageModel : config.model;

  const minDur = config.minDuration ?? 4;
  const clampedDuration = Math.max(minDur, Math.min(config.maxDuration, params.duration));

  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    duration: clampedDuration,
    quality: config.quality ?? "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
    model_params: { web_search: false },
  };

  // Only wire first_frame_url when the engine actually supports I2V.
  // Sending it to a T2V-only engine (e.g. Sora 2) would be rejected by
  // EvoLink's validation layer.
  if (params.imageUrl && config.imageModel) {
    body.first_frame_url = params.imageUrl;
  }

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
