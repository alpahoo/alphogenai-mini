/**
 * BytePlus / Seedance 2.0 cost estimation — surgical, based on the official
 * token formula:
 *
 *   Video Tokens = (Width × Height × FrameRate × Duration) / 1024
 *
 * Price: a token resource plan (e.g. Light Plan = $30.10 / 7M tokens ≈
 * $4.30 / 1M tokens). Override with BYTEPLUS_USD_PER_MTOKEN for pay-as-you-go.
 *
 * Pure functions — usable both server-side (estimate before firing) and
 * client-side (show the estimate in the UI before generation).
 */

/** Seedance default output frame rate. */
export const SEEDANCE_FPS = 24;

/** Default price: Light Plan rate ($30.10 / 7,000,000 tokens). */
export const DEFAULT_USD_PER_MTOKEN = 4.3;

/** Output pixel dimensions per resolution tier. */
const RES_DIMS: Record<string, [number, number]> = {
  "480p": [854, 480],
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
};

export interface BytePlusEstimate {
  resolution: string;
  durationSec: number;
  fps: number;
  /** Tokens consumed per second of output at this resolution/fps. */
  tokensPerSecond: number;
  /** Total tokens for the whole clip. */
  tokens: number;
  /** Price assumption used ($ per 1M tokens). */
  usdPerMToken: number;
  /** Estimated cost in USD. */
  costUsd: number;
}

/** Resolve the $/1M-token price (env override → default plan rate). */
export function bytePlusUsdPerMToken(): number {
  const raw = Number(process.env.BYTEPLUS_USD_PER_MTOKEN);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USD_PER_MTOKEN;
}

/**
 * Estimate token usage + cost for a Seedance clip.
 * @param resolution "480p" | "720p" | "1080p" | "1440p"
 * @param durationSec clip length in seconds
 * @param opts.fps frame rate (default 24)
 * @param opts.usdPerMToken price per 1M tokens (default plan rate)
 */
export function estimateBytePlusCost(
  resolution: string,
  durationSec: number,
  opts: { fps?: number; usdPerMToken?: number } = {}
): BytePlusEstimate {
  const fps = opts.fps ?? SEEDANCE_FPS;
  const usdPerMToken = opts.usdPerMToken ?? DEFAULT_USD_PER_MTOKEN;
  const [w, h] = RES_DIMS[resolution] ?? RES_DIMS["1080p"];

  const tokensPerSecond = Math.round((w * h * fps) / 1024);
  const dur = Math.max(0, durationSec);
  const tokens = Math.round(tokensPerSecond * dur);
  const costUsd = (tokens / 1_000_000) * usdPerMToken;

  return {
    resolution,
    durationSec: dur,
    fps,
    tokensPerSecond,
    tokens,
    usdPerMToken,
    costUsd: Math.round(costUsd * 1000) / 1000,
  };
}
