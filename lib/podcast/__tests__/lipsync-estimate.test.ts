import { describe, it, expect } from "vitest";
import {
  estimatePodcastLipsync,
  secondsFromText,
  formatUsd,
  formatEstimatedTime,
  lipsyncCacheKey,
  planLipsyncTrim,
  LIPSYNC_USD_PER_SECOND,
  LIPSYNC_COST_SAFETY_MARGIN,
} from "../lipsync-estimate";

describe("secondsFromText", () => {
  it("returns 0 for empty/whitespace", () => {
    expect(secondsFromText("")).toBe(0);
    expect(secondsFromText("   ")).toBe(0);
  });
  it("floors short lines at ~1 s", () => {
    expect(secondsFromText("Hi")).toBe(1);
  });
  it("scales with character count", () => {
    // 140 chars / 14 cps = 10 s
    expect(secondsFromText("a".repeat(140))).toBeCloseTo(10, 5);
  });
});

describe("estimatePodcastLipsync", () => {
  it("is zero for no segments", () => {
    const e = estimatePodcastLipsync([]);
    expect(e).toEqual({
      clips: 0,
      totalSeconds: 0,
      estimatedUsd: 0,
      estimatedUsdWithMargin: 0,
      estimatedTimeSeconds: 0,
    });
  });

  it("uses the real observed rate ($0.04/s) and +15% margin", () => {
    // 10 segments × 5 s = 50 s → $2.00 raw, $2.30 with margin
    const e = estimatePodcastLipsync(Array(10).fill(5));
    expect(e.clips).toBe(10);
    expect(e.totalSeconds).toBe(50);
    expect(e.estimatedUsd).toBe(50 * LIPSYNC_USD_PER_SECOND); // 2.0
    expect(e.estimatedUsdWithMargin).toBe(
      Math.round(50 * LIPSYNC_USD_PER_SECOND * (1 + LIPSYNC_COST_SAFETY_MARGIN) * 100) / 100,
    ); // 2.3
  });

  it("ignores non-positive/invalid durations", () => {
    const e = estimatePodcastLipsync([5, 0, -3, 5, NaN as unknown as number]);
    expect(e.clips).toBe(2);
    expect(e.totalSeconds).toBe(10);
  });

  it("estimates generation time with concurrency batching", () => {
    // 4 concurrency, 100 s/clip: 4 clips = 1 batch = 100 s; 5 clips = 2 batches = 200 s
    expect(estimatePodcastLipsync(Array(4).fill(4)).estimatedTimeSeconds).toBe(100);
    expect(estimatePodcastLipsync(Array(5).fill(4)).estimatedTimeSeconds).toBe(200);
  });

  it("reflects that full active-speaker lip-sync is expensive (disclosure intent)", () => {
    // ~2 min podcast, ~120 spoken seconds → clearly several dollars
    const e = estimatePodcastLipsync(Array(24).fill(5));
    expect(e.estimatedUsdWithMargin).toBeGreaterThan(4);
  });
});

describe("lipsyncCacheKey", () => {
  it("is stable for the same inputs", () => {
    const a = lipsyncCacheKey({ audioUrl: "https://r2/x.mp3", baseClipId: "b1", mode: "precision" });
    const b = lipsyncCacheKey({ audioUrl: "https://r2/x.mp3", baseClipId: "b1", mode: "precision" });
    expect(a).toBe(b);
  });
  it("changes when audio, base clip, or mode changes", () => {
    const base = lipsyncCacheKey({ audioUrl: "https://r2/x.mp3", baseClipId: "b1", mode: "precision" });
    expect(lipsyncCacheKey({ audioUrl: "https://r2/y.mp3", baseClipId: "b1", mode: "precision" })).not.toBe(base);
    expect(lipsyncCacheKey({ audioUrl: "https://r2/x.mp3", baseClipId: "b2", mode: "precision" })).not.toBe(base);
    expect(lipsyncCacheKey({ audioUrl: "https://r2/x.mp3", baseClipId: "b1", mode: "speed" })).not.toBe(base);
  });
});

describe("planLipsyncTrim", () => {
  it("trims the video down to the audio when audio is shorter", () => {
    expect(planLipsyncTrim(3.0, 4.28)).toEqual({ ok: true, endTimeSeconds: 3.0 });
  });
  it("allows a small overshoot within ±15% without trimming", () => {
    expect(planLipsyncTrim(4.49, 4.28)).toEqual({ ok: true }); // the mini-gate case
  });
  it("rejects audio too long for the base clip", () => {
    expect(planLipsyncTrim(6.0, 4.28).ok).toBe(false);
  });
  it("rejects invalid durations", () => {
    expect(planLipsyncTrim(0, 4.28).ok).toBe(false);
    expect(planLipsyncTrim(3, 0).ok).toBe(false);
  });
});

describe("formatting", () => {
  it("formats USD to 2 decimals", () => {
    expect(formatUsd(2.3)).toBe("$2.30");
    expect(formatUsd(5.518)).toBe("$5.52");
  });
  it("formats time coarsely", () => {
    expect(formatEstimatedTime(0)).toBe("—");
    expect(formatEstimatedTime(45)).toBe("~45 s");
    expect(formatEstimatedTime(250)).toBe("~4 min");
  });
});
