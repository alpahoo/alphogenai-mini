/**
 * Alibaba Cloud Bailian (DashScope) video generation client.
 *
 * Direct API access — bypasses EvoLink intermediary.
 * Used with Alibaba AI Catalyst Program credits ($200 initial + up to $120k).
 *
 * API docs: https://www.alibabacloud.com/help/en/model-studio/text-to-video-api-reference
 *
 * Flow: POST create task → poll GET /tasks/{id} → SUCCEEDED → video_url
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BAILIAN_BASE_URL =
  process.env.BAILIAN_BASE_URL || "https://dashscope-intl.aliyuncs.com";

export interface BailianEngineConfig {
  /** DashScope model ID for text-to-video */
  model: string;
  /** DashScope model ID for image-to-video (optional) */
  imageModel?: string;
  /** DashScope model ID for reference-to-video (optional) */
  referenceModel?: string;
  /** Maximum video duration in seconds */
  maxDuration: number;
  /** Minimum video duration in seconds */
  minDuration?: number;
  /** Output quality */
  quality?: string;
  /** UI label */
  label: string;
  /** Short description */
  desc: string;
  /** Allowed plans */
  plans: Array<"free" | "pro" | "premium">;
}

export const BAILIAN_ENGINES: Record<string, BailianEngineConfig> = {
  wan_26_bailian: {
    model: "wan2.6-t2v",
    imageModel: "wan2.6-i2v",
    referenceModel: "wan2.6-r2v-flash",
    maxDuration: 15,
    quality: "1080p",
    label: "WAN 2.6 (Bailian)",
    desc: "Bailian Direct · 1080p · up to 15s",
    plans: ["pro", "premium"],
  },
  wan_27_bailian: {
    model: "wan2.7-t2v",
    imageModel: "wan2.7-i2v",
    maxDuration: 10,
    quality: "1080p",
    label: "WAN 2.7 (Bailian)",
    desc: "Bailian Direct · 1080p · latest WAN",
    plans: ["pro", "premium"],
  },
};

/** Returns true if the engine key is a Bailian-routed engine. */
export function isBailianEngine(engineKey: string): boolean {
  return engineKey in BAILIAN_ENGINES;
}

// ---------------------------------------------------------------------------
// Feature flag: transparent A/B routing
// ---------------------------------------------------------------------------

/**
 * Check whether a request to an EvoLink engine should be transparently
 * routed to Bailian instead (A/B test).
 *
 * Controlled by env var BAILIAN_TRAFFIC_PCT (0–100, default 0).
 * Only applies to engines that have a Bailian equivalent.
 */
const EVOLINK_TO_BAILIAN_MAP: Record<string, string> = {
  wan_26: "wan_26_bailian",
  wan_27: "wan_27_bailian",
};

export function maybeRerouteToBailian(engineKey: string): string {
  const bailianKey = EVOLINK_TO_BAILIAN_MAP[engineKey];
  if (!bailianKey) return engineKey;

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return engineKey; // Bailian not configured

  const pct = parseInt(process.env.BAILIAN_TRAFFIC_PCT ?? "0", 10);
  if (isNaN(pct) || pct <= 0) return engineKey;
  if (pct >= 100) return bailianKey;

  return Math.random() * 100 < pct ? bailianKey : engineKey;
}

// ---------------------------------------------------------------------------
// Task creation
// ---------------------------------------------------------------------------

export interface CreateBailianTaskParams {
  engineKey: string;
  prompt: string;
  duration: number;
  imageUrl?: string;
}

interface BailianCreateResponse {
  output?: {
    task_id?: string;
    task_status?: string;
  };
  request_id?: string;
  code?: string;
  message?: string;
}

/**
 * Submit a video generation task to Bailian (DashScope).
 * Returns the task_id for polling.
 */
export async function createBailianTask(
  params: CreateBailianTaskParams,
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY not configured");

  const config = BAILIAN_ENGINES[params.engineKey];
  if (!config) throw new Error(`Unknown Bailian engine: ${params.engineKey}`);

  const clampedDuration = Math.max(
    config.minDuration ?? 2,
    Math.min(config.maxDuration, params.duration),
  );

  // Select model variant: I2V if image provided, else T2V
  const model =
    params.imageUrl && config.imageModel ? config.imageModel : config.model;

  // Build request body per DashScope API spec
  const body: Record<string, unknown> = {
    model,
    input: {
      prompt: params.prompt,
      ...(params.imageUrl && config.imageModel
        ? { img_url: params.imageUrl }
        : {}),
    },
    parameters: {
      size: config.quality === "1080p" ? "1920*1080" : "1280*720",
      duration: clampedDuration,
      prompt_extend: true,
    },
  };

  console.log(
    `[bailian] Creating task: engine=${params.engineKey} model=${model} ` +
      `duration=${clampedDuration}s`,
  );

  const res = await fetch(
    `${BAILIAN_BASE_URL}/api/v1/services/aigc/video-generation/video-synthesis`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(body),
    },
  );

  const data = (await res.json()) as BailianCreateResponse;

  if (!res.ok || !data.output?.task_id) {
    const errMsg = data.message || data.code || `HTTP ${res.status}`;
    console.error("[bailian] Task creation failed:", errMsg, data);
    throw new Error(`Bailian task creation failed: ${errMsg}`);
  }

  console.log(
    `[bailian] Task created: ${data.output.task_id} (request_id=${data.request_id})`,
  );
  return data.output.task_id;
}

// ---------------------------------------------------------------------------
// Task polling
// ---------------------------------------------------------------------------

interface BailianTaskResponse {
  output?: {
    task_id?: string;
    task_status?: string;
    video_url?: string;
    orig_prompt?: string;
  };
  request_id?: string;
  usage?: {
    duration?: number;
    output_video_duration?: number;
  };
  code?: string;
  message?: string;
}

export interface BailianTaskResult {
  taskId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  videoUrl?: string;
  errorMessage?: string;
}

const STATUS_MAP: Record<string, BailianTaskResult["status"]> = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELED: "failed",
  UNKNOWN: "pending",
};

/**
 * Poll a Bailian task status.
 * Returns normalized status + video URL when done.
 */
export async function getBailianTask(taskId: string): Promise<BailianTaskResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY not configured");

  const res = await fetch(`${BAILIAN_BASE_URL}/api/v1/tasks/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const data = (await res.json()) as BailianTaskResponse;

  const rawStatus = data.output?.task_status ?? "UNKNOWN";
  const status = STATUS_MAP[rawStatus] ?? "pending";

  return {
    taskId,
    status,
    videoUrl: status === "succeeded" ? data.output?.video_url : undefined,
    errorMessage: status === "failed" ? (data.message || rawStatus) : undefined,
  };
}
