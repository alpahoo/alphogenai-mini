/**
 * Lip-sync reuse cost estimation — simple heuristic for HeyGen lip-sync.
 *
 * Costs are estimated based on script length (TTS) + lip-sync duration + mode.
 * These are rough estimates; actual HeyGen pricing varies by plan / account.
 *
 * Pure functions — usable both server-side (validate) and client-side (UI preview).
 */

export interface LipsyncCostEstimate {
  /** Script length in characters */
  scriptLength: number;
  /** Lip-sync mode: "speed" (cheaper, faster) | "precision" (better quality) */
  mode: "speed" | "precision";
  /** Estimated duration of the reused video (seconds) */
  estimatedDurationSec: number;
  /** TTS cost estimate (credits) */
  ttsCost: number;
  /** Lip-sync cost estimate (credits) */
  lipsyncCost: number;
  /** Total estimated cost (credits) */
  totalCost: number;
  /** Percentage of full Avatar Shots video cost (rough guide) */
  percentOfFullVideo: number;
}

/**
 * Estimate TTS + lip-sync cost for reusing a saved Look.
 *
 * @param scriptLength Number of characters in the script
 * @param lipsyncMode "speed" or "precision"
 * @param estimatedDurationSec Expected duration of the reused video (default 10s)
 * @returns Cost estimate
 */
export function estimateLipsyncCost(
  scriptLength: number,
  lipsyncMode: "speed" | "precision" = "speed",
  estimatedDurationSec: number = 10
): LipsyncCostEstimate {
  // TTS cost: ~0.01 credits per 100 characters (rough estimate)
  // A 2000-char script ≈ 2 credits; 5000-char ≈ 5 credits
  const ttsCost = Math.ceil((scriptLength / 100) * 0.1);

  // Lip-sync cost: depends on mode + duration
  // Speed mode: ~2 credits/sec (faster, lower quality)
  // Precision mode: ~5 credits/sec (slower, better sync)
  const lipsyncCostPerSecond = lipsyncMode === "precision" ? 5 : 2;
  const lipsyncCost = Math.ceil(estimatedDurationSec * lipsyncCostPerSecond);

  const totalCost = ttsCost + lipsyncCost;

  // Full Avatar Shots video is ~50–100 credits (rough estimate)
  // Lip-sync reuse is ~5–20% of that
  const percentOfFullVideo = Math.round((totalCost / 75) * 100);

  return {
    scriptLength,
    mode: lipsyncMode,
    estimatedDurationSec,
    ttsCost,
    lipsyncCost,
    totalCost,
    percentOfFullVideo: Math.min(percentOfFullVideo, 25), // Cap at 25%
  };
}

/**
 * Format a cost estimate for display.
 * @example "15 credits (~18% of full video)"
 */
export function formatLipsyncCostEstimate(estimate: LipsyncCostEstimate): string {
  return `${estimate.totalCost} credits (~${estimate.percentOfFullVideo}% of full video)`;
}
