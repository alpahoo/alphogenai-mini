import { describe, it, expect } from "vitest";
import { estimateBytePlusCost, SEEDANCE_FPS } from "@/lib/byteplus-cost";

describe("estimateBytePlusCost — official formula (W*H*fps*dur)/1024", () => {
  it("1080p tokens/s = 1920*1080*24/1024 = 48600", () => {
    const e = estimateBytePlusCost("1080p", 5, { usdPerMToken: 4.3 });
    expect(e.tokensPerSecond).toBe(48600);
    expect(e.tokens).toBe(243000);
    // 243000 / 1e6 * 4.3 = 1.0449 → rounded to 3 decimals
    expect(e.costUsd).toBeCloseTo(1.045, 3);
  });

  it("720p tokens/s = 1280*720*24/1024 = 21600", () => {
    const e = estimateBytePlusCost("720p", 15, { usdPerMToken: 4.3 });
    expect(e.tokensPerSecond).toBe(21600);
    expect(e.tokens).toBe(324000);
    expect(e.costUsd).toBeCloseTo(1.393, 3);
  });

  it("real-rate 1.5 Pro 720p with audio ($2.40/M)", () => {
    // Calibrated against a real task: 5s/720p ≈ 108900 tokens.
    const e = estimateBytePlusCost("720p", 5, { usdPerMToken: 2.4 });
    expect(e.tokens).toBe(108000); // formula ~0.8% under the real 108900
    expect(e.costUsd).toBeCloseTo(0.259, 3); // 108000/1e6 * 2.4
  });

  it("480p tokens/s = 854*480*24/1024", () => {
    const e = estimateBytePlusCost("480p", 5);
    expect(e.tokensPerSecond).toBe(Math.round((854 * 480 * 24) / 1024));
    expect(e.fps).toBe(SEEDANCE_FPS);
  });

  it("honours a custom $/1M token price", () => {
    const e = estimateBytePlusCost("1080p", 5, { usdPerMToken: 6.3 });
    expect(e.usdPerMToken).toBe(6.3);
    expect(e.costUsd).toBeCloseTo((243000 / 1_000_000) * 6.3, 3);
  });

  it("unknown resolution falls back to 1080p", () => {
    const e = estimateBytePlusCost("weird", 5);
    expect(e.tokensPerSecond).toBe(48600);
  });
});
