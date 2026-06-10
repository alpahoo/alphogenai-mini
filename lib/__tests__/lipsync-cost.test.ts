import { describe, expect, it } from "vitest";
import { estimateLipsyncCost, formatLipsyncCostEstimate } from "@/lib/lipsync-cost";

describe("estimateLipsyncCost", () => {
  it("estimates cost for a short script with speed mode", () => {
    const est = estimateLipsyncCost(500, "speed", 5);
    expect(est.scriptLength).toBe(500);
    expect(est.mode).toBe("speed");
    expect(est.ttsCost).toBe(1); // ~0.01 credits per 100 chars
    expect(est.lipsyncCost).toBe(10); // 5 sec * 2 credits/sec
    expect(est.totalCost).toBe(11);
  });

  it("estimates cost for a medium script with precision mode", () => {
    const est = estimateLipsyncCost(2000, "precision", 10);
    expect(est.ttsCost).toBe(2); // 2000 / 100 * 0.1 = 2
    expect(est.lipsyncCost).toBe(50); // 10 sec * 5 credits/sec
    expect(est.totalCost).toBe(52);
    expect(est.percentOfFullVideo).toBeGreaterThan(0);
    expect(est.percentOfFullVideo).toBeLessThanOrEqual(25);
  });

  it("estimates cost for a long script", () => {
    const est = estimateLipsyncCost(5000, "speed", 12);
    expect(est.ttsCost).toBe(5); // 5000 / 100 * 0.1 = 5
    expect(est.lipsyncCost).toBe(24); // 12 sec * 2 credits/sec
    expect(est.totalCost).toBe(29);
  });

  it("defaults to speed mode and 10s duration", () => {
    const est = estimateLipsyncCost(1000);
    expect(est.mode).toBe("speed");
    expect(est.estimatedDurationSec).toBe(10);
  });

  it("caps percentOfFullVideo at 25%", () => {
    const est = estimateLipsyncCost(20000, "precision", 20);
    expect(est.percentOfFullVideo).toBeLessThanOrEqual(25);
  });
});

describe("formatLipsyncCostEstimate", () => {
  it("formats estimate as human-readable string", () => {
    const est = estimateLipsyncCost(1000, "speed", 10);
    const fmt = formatLipsyncCostEstimate(est);
    expect(fmt).toMatch(/\d+ credits/);
    expect(fmt).toMatch(/~\d+%/);
  });
});
