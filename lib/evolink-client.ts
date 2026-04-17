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
  /** Display label */
  label: string;
  /** Short description for the UI */
  desc: string;
  /** Plans allowed (mirrors backend plan gate) */
  plans: Array<"free" | "pro" | "premium">;
}

export const EVOLINK_ENGINES: Record<string, EvoLinkEngineConfig> = {
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
  kling_o3: {
    model: "kling-o3-text-to-video",
    imageModel: "kling-o3-image-to-video",
    maxDuration: 15,
    label: "Kling O3",
    desc: "EvoLink • 720p/1080p • up to 15s",
    plans: ["pro", "premium"],
  },
};

/** Returns true if the given engine key is handled by EvoLink (not Modal). */
export function isEvoLinkEngine(engineKey: string): boolean {
  return engineKey in EVOLINK_ENGINES;
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

  const clampedDuration = Math.max(4, Math.min(config.maxDuration, params.duration));

  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    duration: clampedDuration,
    quality: "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
    model_params: { web_search: false },
  };

  if (params.imageUrl) {
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

  // Support both unified API ("status") and legacy ("state") field names
  const state: string = data.status || data.state || "unknown";

  if (state === "completed" || state === "success") {
    const output: Record<string, unknown> = (data.output as Record<string, unknown>) || {};
    const result: Record<string, unknown> = (data.result as Record<string, unknown>) || {};

    const videoUrl =
      (output.video_url as string | undefined) ||
      (result.video_url as string | undefined) ||
      (data.video_url as string | undefined) ||
      ((output.videos as string[] | undefined) || [])[0] ||
      ((result.videos as string[] | undefined) || [])[0];

    if (!videoUrl) {
      throw new Error(
        `EvoLink task ${taskId} completed but no video URL found. Keys: ${Object.keys(data).join(", ")}`
      );
    }

    return { status: "completed", videoUrl };
  }

  if (["failed", "fail", "error", "cancelled", "canceled"].includes(state)) {
    const errData = data.error as Record<string, unknown> | string | undefined;
    const error =
      typeof errData === "string"
        ? errData
        : (errData?.message as string) ||
          (data.error_message as string) ||
          (data.failMsg as string) ||
          "Unknown error";

    return { status: "failed", error };
  }

  // still in progress
  return { status: state === "pending" ? "pending" : "processing" };
}
