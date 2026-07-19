export const VIDEO_PRESENTER_BUCKET = "user-video-presenters";
export const VIDEO_PRESENTER_CONSENT_VERSION = "v1-2026-07-19";
export const VIDEO_PRESENTER_CONSENT =
  "I confirm that I am the person shown, or have their explicit permission, and authorize the creation and commercial use of an AI video presenter from this footage.";

export const VIDEO_PRESENTER_SOURCE_MAX_BYTES = 200 * 1024 * 1024;
export const VIDEO_PRESENTER_CONSENT_MAX_BYTES = 100 * 1024 * 1024;
export const VIDEO_PRESENTER_MIN_BYTES = 64 * 1024;

export const VIDEO_PRESENTER_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export type VideoPresenterStatus =
  | "uploading"
  | "pending"
  | "claimed"
  | "submitted"
  | "processing"
  | "ready"
  | "failed"
  | "needs_login"
  | "needs_review"
  | "removed";

export interface VideoPresenterRequestRow {
  id: string;
  user_id: string;
  name: string;
  provider_name: string;
  source_video_path: string;
  consent_video_path: string;
  source_mime: string;
  consent_mime: string;
  source_size_bytes: number;
  consent_size_bytes: number;
  status: VideoPresenterStatus;
  external_avatar_id: string | null;
  presenter_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

export function videoExtension(mime: string) {
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  return "mp4";
}

export function validateVideoUpload(
  file: { type?: unknown; size?: unknown },
  kind: "source" | "consent",
) {
  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  const size = typeof file.size === "number" ? file.size : Number.NaN;
  if (!VIDEO_PRESENTER_MIME.has(type)) {
    return "Use an MP4, MOV, or WEBM video.";
  }
  const max = kind === "source"
    ? VIDEO_PRESENTER_SOURCE_MAX_BYTES
    : VIDEO_PRESENTER_CONSENT_MAX_BYTES;
  if (!Number.isFinite(size) || size < VIDEO_PRESENTER_MIN_BYTES || size > max) {
    return kind === "source"
      ? "Source footage must be between 64 KB and 200 MB."
      : "Consent footage must be between 64 KB and 100 MB.";
  }
  return null;
}

export function toPublicVideoPresenterRequest(row: VideoPresenterRequestRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    presenterId: row.presenter_id,
    error: row.status === "failed" || row.status === "needs_review"
      ? videoPresenterFailureMessage(row.error_code)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function videoPresenterFailureMessage(code: string | null) {
  if (code === "needs_login") return "Presenter processing is paused for maintenance.";
  if (code === "provider_ui_changed") return "Presenter processing needs a quick support review.";
  if (code === "invalid_footage") return "The footage could not be accepted. Check the recording guide and try again.";
  if (code === "consent_rejected") return "The consent clip could not be verified.";
  return "The video presenter could not be completed. Support can retry it without another upload.";
}
