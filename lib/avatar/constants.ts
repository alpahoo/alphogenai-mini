/** Client-safe constants and pure helpers of the talking-avatar flow (no Node-only import: used by the browser bundle). */
export const AVATAR_FPS = 25;
/** Frames of the first segment, then added per continuation segment (upstream: 93 frames, 13 conditioning frames). */
export const FIRST_SEGMENT_FRAMES = 93;
export const NEW_FRAMES_PER_SEGMENT = 80;
export const MAX_SEGMENTS = 3;
export const DEFAULT_PROMPT =
  "A young woman facing the camera in a front-facing close-up, centred in frame, soft even light. She speaks with a natural friendly expression, her mouth clearly visible, subtle natural head movement.";

/** Number of segments needed to cover an audio of `seconds` (1..3), or null when it exceeds the first-scope limit. */
export function segmentsFor(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const frames = Math.ceil(seconds * AVATAR_FPS);
  const segments = 1 + Math.max(0, Math.ceil((frames - FIRST_SEGMENT_FRAMES) / NEW_FRAMES_PER_SEGMENT));
  return segments > MAX_SEGMENTS ? null : segments;
}
export const videoSecondsFor = (segments: number) => (FIRST_SEGMENT_FRAMES + (segments - 1) * NEW_FRAMES_PER_SEGMENT) / AVATAR_FPS;
