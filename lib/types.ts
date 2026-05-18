// ---------------------------------------------------------------------------
// Job statuses — simplified v3
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "in_progress" | "done" | "failed";

export type JobPlan = "free" | "pro" | "premium";

export type JobStage =
  | "queued"
  | "spawning_pipeline"
  | "generating_scene_1"
  | "generating_scene_2"
  | "generating_scene_3"
  | "generating_scene_4"
  | "generating_scene_5"
  | "encoding"
  | "uploading"
  | "generating_audio"
  | "muxing_audio"
  | "completed"
  | "failed";

export interface Job {
  id: string;
  prompt: string;
  status: JobStatus;
  plan: JobPlan;
  current_stage: JobStage | null;
  video_url: string | null;
  audio_url: string | null;
  output_url_final: string | null;
  error_message: string | null;
  storyboard: StoryboardScene[] | null;
  target_duration_seconds: number;
  image_url: string | null;
  engine_used: string | null;
  estimated_cost_usd: number | string | null;
  // Social export URLs populated by Modal `export_social_formats` —
  // shape: { tiktok?: url, instagram?: url, youtube?: url }
  social_exports: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Scene types — Phase 1 multi-scene foundations
// ---------------------------------------------------------------------------

export type SceneStatus =
  | "pending"
  | "generating"
  | "encoding"
  | "uploading"
  | "done"
  | "failed"
  | "skipped";

export type EngineKey =
  | "wan_i2v"
  | "seedance"
  | "evolink"
  | "evolink_fast"
  | "kling_o3"
  | "kling_v3"
  | "wan_26"
  | "wan_27"
  | "wan_26_bailian"
  | "happy_horse_10"
  | "hailuo"
  | "hailuo_fast"
  | "sora_2";

export interface StoryboardScene {
  scene_index: number;
  prompt: string;
  engine: EngineKey;
  duration_sec: number;
}

export interface JobScene {
  id: string;
  job_id: string;
  scene_index: number;
  prompt: string;
  engine: EngineKey;
  duration_sec: number;
  status: SceneStatus;
  clip_url: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Multi-Reference types (V1)
export type ReferenceRole = "character_face" | "outfit_style" | "camera_motion" | "mood";

export interface ReferenceItem {
  role: ReferenceRole;
  url: string;
  // V1 Étape A: canonical storage path inside the private `references` bucket
  // (shape `{user_id}/{uuid}.{ext}`). Source of truth — the `url` field above
  // is just a transient signed-URL for UI preview. Legacy V0 references
  // (with only `url`) remain valid; this field is optional for backward compat.
  storage_path?: string;
  mime_type?: string;
  filename?: string;
  weight?: number; // 0.0-1.0, default 0.7 — UI not exposed in V1
  // V1.1 TODO: populated by upload route, used for cumulative size check (50 MB cap).
  // Not yet persisted — field reserved for forward compat.
  size_bytes?: number;
}

export interface ReferencePayload {
  images?: ReferenceItem[];
  videos?: ReferenceItem[];
  audio?: ReferenceItem[];
}

export interface CreateJobRequest {
  prompt: string;
  plan?: JobPlan;
  target_duration_seconds?: number;
  preferred_engine?: EngineKey;
  references?: ReferencePayload;
}

export interface CreateJobResponse {
  success: boolean;
  jobId: string;
  job: Job;
}

export interface JobResponse {
  success: boolean;
  job: Job;
}

export interface ErrorResponse {
  error: string;
}

export const STAGE_LABELS: Record<JobStage, string> = {
  queued: "In queue",
  spawning_pipeline: "Starting pipeline",
  generating_scene_1: "Generating scene 1",
  generating_scene_2: "Generating scene 2",
  generating_scene_3: "Generating scene 3",
  generating_scene_4: "Generating scene 4",
  generating_scene_5: "Generating scene 5",
  encoding: "Encoding video",
  uploading: "Uploading",
  generating_audio: "Generating audio",
  muxing_audio: "Mixing audio",
  completed: "Complete",
  failed: "Failed",
};

export const STAGE_ORDER: JobStage[] = [
  "queued",
  "spawning_pipeline",
  "generating_scene_1",
  "generating_scene_2",
  "generating_scene_3",
  "generating_scene_4",
  "generating_scene_5",
  "encoding",
  "uploading",
  "generating_audio",
  "muxing_audio",
  "completed",
];

export const ENGINE_DISPLAY_NAMES: Record<string, string> = {
  wan_i2v: "Wan 2.2 I2V",
  seedance: "Seedance 2.0 (Kie.ai)",
  evolink: "Seedance 2.0",
  evolink_fast: "Seedance 2.0 Fast",
  kling_o3: "Kling O3",
  kling_v3: "Kling 3.0",
  wan_26: "WAN 2.6",
  wan_27: "WAN 2.7",
  wan_26_bailian: "WAN 2.6 (Bailian)",
  happy_horse_10: "Happy Horse 1.0",
  hailuo: "Hailuo 2.3",
  hailuo_fast: "Hailuo 2.3 Fast",
  sora_2: "Sora 2 Pro",
};

export function getEngineDisplayName(engine: string | null | undefined): string {
  if (!engine) return "Wan 2.2 I2V";
  return ENGINE_DISPLAY_NAMES[engine] ?? engine;
}

export const PLAN_LABELS: Record<JobPlan, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};

export const PLAN_MAX_DURATION: Record<JobPlan, number> = {
  free: 5,
  pro: 15,
  premium: 120,
};

export const PLAN_MAX_SCENES: Record<JobPlan, number> = {
  free: 1,
  pro: 3,
  premium: 10,
};

/** Daily (24 h rolling window) generation quota per plan. -1 = unlimited. */
export const PLAN_DAILY_QUOTA: Record<JobPlan, number> = {
  free: 1,
  pro: 50,
  premium: -1, // unlimited
};
