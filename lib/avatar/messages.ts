import { errorMessage } from "@/lib/studio/status";
import { MAX_AUDIO_SECONDS, MIN_AUDIO_SECONDS } from "./audio-library";

/** Fixed error codes written by the broker for talking-avatar runs (modal_app/comfy/avatar.py). Never raw provider text. */
const AVATAR_MESSAGES: Record<string, string> = {
  AUDIO_TOO_LONG: `This audio is longer than ${MAX_AUDIO_SECONDS} seconds. No GPU was used. Choose a shorter audio.`,
  AUDIO_TOO_SHORT: `This audio is shorter than ${MIN_AUDIO_SECONDS} second. No GPU was used. Choose a longer audio.`,
  INVALID_AUDIO: "This audio could not be read. No GPU was used. Choose another audio.",
  INVALID_AUDIO_PATH: "The audio is not in your private library. No GPU was used.",
  INVALID_IMAGE: "This portrait could not be read. Choose another portrait.",
  IMAGE_TOO_LARGE: "This portrait is too large. Choose another portrait.",
  INVALID_REFERENCE: "The portrait is not in your private library. No GPU was used.",
  AVATAR_EXECUTION_FAILED: "The render failed on the GPU. It was not retried automatically. Start a new render when ready.",
  AVATAR_OUTPUT_INVALID: "The GPU returned an unusable video. It was not published. Start a new render when ready.",
  GENERATION_FAILED: "The render failed. It was not retried automatically. Start a new render when ready.",
  MISSING_OUTPUTS: "The render finished without a video. Start a new render when ready.",
};

export function avatarErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AVATAR_MESSAGES[code] ?? errorMessage(code);
}

/** Whether a failed run can be started again from the current selection (a new run, a new reservation, explicit click). */
export function canRenderAgain(status: string): boolean {
  return ["done", "failed", "expired", "cancelled"].includes(status);
}

/** Honest expected video length for an audio of `seconds`: 3.72, 6.92 or 10.12 s (the model renders whole segments). */
export function expectedVideoLabel(segments: number | null): string {
  if (segments === null) return "unknown until the audio is checked";
  return `${(([93, 173, 253][segments - 1]) / 25).toFixed(2)} s`;
}
