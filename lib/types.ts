export type JobStatus = "pending" | "in_progress" | "done" | "failed";

export type JobStage =
  | "queued"
  | "generating_video"
  | "generating_audio"
  | "mixing"
  | "uploading"
  | "completed";

export interface Job {
  id: string;
  prompt: string;
  status: JobStatus;
  current_stage: JobStage | null;
  video_url: string | null;
  audio_url: string | null;
  output_url_final: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobRequest {
  prompt: string;
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
  generating_video: "Generating video",
  generating_audio: "Generating audio",
  mixing: "Mixing audio & video",
  uploading: "Uploading",
  completed: "Complete",
};

export const STAGE_ORDER: JobStage[] = [
  "queued",
  "generating_video",
  "generating_audio",
  "mixing",
  "uploading",
  "completed",
];
