export const NATIVE_PRESENTER_BASE_BUCKET = "user-presenter-native-bases";
export const NATIVE_PRESENTER_RETENTION_CONSENT_VERSION = "v1-2026-07-26";
export const NATIVE_PRESENTER_NORMALIZATION_VERSION = "square-720p25-silent-v1";
export const NATIVE_PRESENTER_NORMALIZED_WIDTH = 720;
export const NATIVE_PRESENTER_NORMALIZED_HEIGHT = 720;
export const NATIVE_PRESENTER_NORMALIZED_FPS = 25;
export const NATIVE_PRESENTER_NORMALIZED_MAX_SECONDS = 30;
export const NATIVE_PRESENTER_RETENTION_CONSENT =
  "I choose to keep a private copy of this performance footage for up to one year so AlphoGen can create and reuse my native AI presenter. I can delete it from my account.";

export type NativePresenterBaseStatus =
  | "uploading"
  | "uploaded"
  | "normalizing"
  | "ready"
  | "failed"
  | "removed";

export interface NativePresenterBaseRow {
  id: string;
  user_id: string;
  request_id: string | null;
  name: string;
  video_path: string;
  video_mime: string;
  video_size_bytes: number;
  normalized_video_path: string | null;
  normalized_duration_seconds: number | null;
  normalized_width: number | null;
  normalized_height: number | null;
  normalized_fps: number | null;
  normalization_version: string | null;
  normalization_started_at: string | null;
  normalized_at: string | null;
  status: NativePresenterBaseStatus;
  error_code: string | null;
  consent_confirmed_at: string;
  consent_statement_version: string;
  retention_until: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function canStartNativePresenterNormalization(status: NativePresenterBaseStatus) {
  return status === "uploaded" || status === "failed";
}

export function nativePresenterNormalizedPath(userId: string, baseId: string) {
  return `${userId}/${baseId}/normalized-v1.mp4`;
}

export function toPublicNativePresenterBase(
  row: Pick<
    NativePresenterBaseRow,
    "id" | "status" | "retention_until" | "normalized_at"
  >,
) {
  return {
    id: row.id,
    status: row.status,
    retentionUntil: row.retention_until,
    normalizedAt: row.normalized_at,
  };
}

export function wantsNativePresenterBase(input: {
  retainForNative?: unknown;
  nativeRetentionConsent?: unknown;
}) {
  const requested = input.retainForNative === true;
  if (requested && input.nativeRetentionConsent !== true) {
    return {
      requested,
      error: "Confirm the separate retention permission to save a reusable native presenter.",
    };
  }
  return { requested, error: null };
}
