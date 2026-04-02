// ---------------------------------------------------------------------------
// Job statuses — simplified v3
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "in_progress" | "uploading" | "done" | "failed";

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

export type EngineKey = "wan_i2v" | "seedance";

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

export interface CreateJobRequest {
  prompt: string;
  plan?: JobPlan;
  target_duration_seconds?: number;
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
  "completed",
];

export const PLAN_LABELS: Record<JobPlan, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};

export const PLAN_MAX_DURATION: Record<JobPlan, number> = {
  free: 5,
  pro: 60,
  premium: 120,
};
