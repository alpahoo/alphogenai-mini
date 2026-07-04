/**
 * Podcast lip-sync cost + time estimator (T-1145).
 *
 * Pure, dependency-free functions used by the UI to show an up-front estimate
 * BEFORE any HeyGen call, so `lipsync_premium` is always opt-in and cost-disclosed.
 * No credits are spent here — this only computes/forecasts.
 *
 * Rate is USD-based on the REAL observed HeyGen cost (dashboard 2026-07-05):
 * one ~5 s precision lip-sync clip ≈ $0.20 → ~$0.04 / second.
 *
 * NOTE (HeyGen constraint, enforced later at render time in T-1144b): each
 * lip-sync clip requires the audio duration to be within ±15% of the base-clip
 * duration (or a correct trim). It is exported here so the estimator/spec stay
 * the single source of truth for the number.
 */

/** Observed HeyGen precision-mode cost per second of output (USD). Configurable. */
export const LIPSYNC_USD_PER_SECOND = 0.04;
/** Safety margin added on top of the raw estimate (variable segment durations). */
export const LIPSYNC_COST_SAFETY_MARGIN = 0.15;
/** TTS speaking-rate proxy to estimate segment seconds from text pre-render. */
export const LIPSYNC_CHARS_PER_SECOND = 14;
/** Observed async generation latency per precision clip (seconds). */
export const LIPSYNC_SECONDS_PER_CLIP = 100;
/** How many clips we expect to generate/poll concurrently. */
export const LIPSYNC_CLIP_CONCURRENCY = 4;
/** HeyGen audio/video duration must match within this ratio (±15%). */
export const HEYGEN_DURATION_TOLERANCE = 0.15;

export interface PodcastLipsyncEstimate {
  /** Number of lip-sync clips (one per active-speaker segment). */
  clips: number;
  /** Total spoken seconds to lip-sync (sum of active segment durations). */
  totalSeconds: number;
  /** Raw estimated cost (USD) = totalSeconds * rate. */
  estimatedUsd: number;
  /** Estimated cost with the safety margin applied (USD). */
  estimatedUsdWithMargin: number;
  /** Estimated wall-clock generation time (seconds), accounting for concurrency. */
  estimatedTimeSeconds: number;
}

/**
 * Rough seconds a TTS line will speak, from its character count. Pre-render proxy
 * (actual durations are only known after synthesis). Floors at ~1 s per line.
 */
export function secondsFromText(text: string): number {
  const chars = (text || "").trim().length;
  if (chars === 0) return 0;
  return Math.max(1, chars / LIPSYNC_CHARS_PER_SECOND);
}

/**
 * Estimate cost + time for lip-syncing a set of active-speaker segments.
 * @param segmentSeconds duration (seconds) of each segment to lip-sync
 */
export function estimatePodcastLipsync(segmentSeconds: number[]): PodcastLipsyncEstimate {
  const durations = (segmentSeconds || []).filter((s) => typeof s === "number" && s > 0);
  const clips = durations.length;
  const totalSeconds = Math.round(durations.reduce((a, b) => a + b, 0) * 100) / 100;

  const estimatedUsd = Math.round(totalSeconds * LIPSYNC_USD_PER_SECOND * 100) / 100;
  const estimatedUsdWithMargin =
    Math.round(estimatedUsd * (1 + LIPSYNC_COST_SAFETY_MARGIN) * 100) / 100;

  const batches = clips === 0 ? 0 : Math.ceil(clips / LIPSYNC_CLIP_CONCURRENCY);
  const estimatedTimeSeconds = batches * LIPSYNC_SECONDS_PER_CLIP;

  return { clips, totalSeconds, estimatedUsd, estimatedUsdWithMargin, estimatedTimeSeconds };
}

/** Format USD for display, e.g. 5.518 → "$5.52". */
export function formatUsd(usd: number): string {
  return `$${(Math.round(usd * 100) / 100).toFixed(2)}`;
}

/** Format a duration in seconds as a coarse human string, e.g. 250 → "~5 min". */
export function formatEstimatedTime(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 90) return `~${Math.round(seconds)} s`;
  return `~${Math.round(seconds / 60)} min`;
}
