export const NATIVE_PRESENTER_ANIMATION_BUCKET =
  "user-presenter-native-animations";
export const NATIVE_PRESENTER_ANIMATION_VERSION = "native-lipsync-v1";
export const NATIVE_PRESENTER_ANIMATION_MAX_BYTES = 25 * 1024 * 1024;
export const NATIVE_PRESENTER_ANIMATION_MAX_SECONDS = 8;

export const NATIVE_PRESENTER_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);

export type NativePresenterAnimationStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "needs_review"
  | "removed";

export interface NativePresenterAnimationRow {
  id: string;
  user_id: string;
  native_base_id: string;
  audio_path: string;
  audio_mime: string;
  audio_size_bytes: number;
  audio_sha256: string;
  output_video_path: string | null;
  output_duration_seconds: number | null;
  status: NativePresenterAnimationStatus;
  provider_task_id: string | null;
  animation_version: string;
  error_code: string | null;
  started_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function validateNativeAnimationAudio(input: {
  type?: unknown;
  size?: unknown;
  sha256?: unknown;
}) {
  const type = typeof input.type === "string" ? input.type.toLowerCase() : "";
  const size = Number(input.size);
  const sha256 =
    typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";
  if (!NATIVE_PRESENTER_AUDIO_MIMES.has(type)) {
    return "Use an MP3, M4A, WAV, or WebM speech file.";
  }
  if (!Number.isFinite(size) || size < 1024 || size > NATIVE_PRESENTER_ANIMATION_MAX_BYTES) {
    return "Speech audio must be between 1 KB and 25 MB.";
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    return "Could not verify the speech audio.";
  }
  return null;
}

export function nativeAnimationAudioExtension(mime: string) {
  switch (mime.toLowerCase()) {
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
      return "m4a";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    default:
      return "audio";
  }
}

export function toPublicNativePresenterAnimation(
  row: Pick<
    NativePresenterAnimationRow,
    | "id"
    | "native_base_id"
    | "status"
    | "output_duration_seconds"
    | "error_code"
    | "created_at"
    | "updated_at"
  >,
) {
  return {
    id: row.id,
    nativeBaseId: row.native_base_id,
    status: row.status,
    durationSeconds: row.output_duration_seconds,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
