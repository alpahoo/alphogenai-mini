import { describe, it, expect } from "vitest";
import {
  isEvoLinkEngine,
  engineSupportsFirstFrame,
  EVOLINK_ENGINES,
} from "../evolink-client";

// ---------------------------------------------------------------------------
// 1. isEvoLinkEngine()
// ---------------------------------------------------------------------------

describe("isEvoLinkEngine", () => {
  it("returns true for evolink (Seedance 2.0)", () => {
    expect(isEvoLinkEngine("evolink")).toBe(true);
  });

  it("returns true for evolink_fast", () => {
    expect(isEvoLinkEngine("evolink_fast")).toBe(true);
  });

  it("returns true for kling_o3", () => {
    expect(isEvoLinkEngine("kling_o3")).toBe(true);
  });

  it("returns true for sora_2", () => {
    expect(isEvoLinkEngine("sora_2")).toBe(true);
  });

  it("returns true for hailuo", () => {
    expect(isEvoLinkEngine("hailuo")).toBe(true);
  });

  it("returns false for wan_i2v (Modal engine)", () => {
    expect(isEvoLinkEngine("wan_i2v")).toBe(false);
  });

  it("returns false for seedance (legacy Modal key)", () => {
    expect(isEvoLinkEngine("seedance")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isEvoLinkEngine("")).toBe(false);
  });

  it("returns false for random string", () => {
    expect(isEvoLinkEngine("nonexistent_engine")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. engineSupportsFirstFrame()
// ---------------------------------------------------------------------------

describe("engineSupportsFirstFrame", () => {
  it("returns true for evolink (has imageModel)", () => {
    expect(engineSupportsFirstFrame("evolink")).toBe(true);
  });

  it("returns true for evolink_fast (has imageModel)", () => {
    expect(engineSupportsFirstFrame("evolink_fast")).toBe(true);
  });

  it("returns true for kling_o3 (has imageModel)", () => {
    expect(engineSupportsFirstFrame("kling_o3")).toBe(true);
  });

  it("returns true for wan_26 (has imageModel)", () => {
    expect(engineSupportsFirstFrame("wan_26")).toBe(true);
  });

  it("returns false for sora_2 (no imageModel)", () => {
    expect(engineSupportsFirstFrame("sora_2")).toBe(false);
  });

  it("returns false for unknown engine", () => {
    expect(engineSupportsFirstFrame("nonexistent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. EVOLINK_ENGINES registry integrity
// ---------------------------------------------------------------------------

describe("EVOLINK_ENGINES registry", () => {
  const engines = Object.entries(EVOLINK_ENGINES);

  it("has at least 5 engines registered", () => {
    expect(engines.length).toBeGreaterThanOrEqual(5);
  });

  it.each(engines)("%s has required fields", (key, config) => {
    expect(config.model).toBeTruthy();
    expect(typeof config.model).toBe("string");
    expect(typeof config.maxDuration).toBe("number");
    expect(config.maxDuration).toBeGreaterThan(0);
    expect(typeof config.label).toBe("string");
    expect(config.label.length).toBeGreaterThan(0);
    expect(typeof config.desc).toBe("string");
    expect(Array.isArray(config.plans)).toBe(true);
    expect(config.plans.length).toBeGreaterThan(0);
  });

  it.each(engines)("%s plans contain only valid plan keys", (_key, config) => {
    const validPlans = new Set(["free", "pro", "premium"]);
    for (const plan of config.plans) {
      expect(validPlans.has(plan)).toBe(true);
    }
  });

  it("sora_2 is premium-only", () => {
    expect(EVOLINK_ENGINES.sora_2.plans).toEqual(["premium"]);
  });

  it("evolink (Seedance 2.0) includes pro", () => {
    expect(EVOLINK_ENGINES.evolink.plans).toContain("pro");
  });

  it("no EvoLink engine is available to free plan", () => {
    for (const [, config] of engines) {
      expect(config.plans).not.toContain("free");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Reference model support
// ---------------------------------------------------------------------------

describe("EVOLINK_ENGINES — reference model support", () => {
  it("evolink has referenceModel", () => {
    expect(EVOLINK_ENGINES.evolink.referenceModel).toBeTruthy();
  });

  it("evolink_fast has referenceModel", () => {
    expect(EVOLINK_ENGINES.evolink_fast.referenceModel).toBeTruthy();
  });

  it("kling_o3 has referenceModel", () => {
    expect(EVOLINK_ENGINES.kling_o3.referenceModel).toBeTruthy();
  });

  it("sora_2 does NOT have referenceModel", () => {
    expect(EVOLINK_ENGINES.sora_2.referenceModel).toBeUndefined();
  });

  it("hailuo does NOT have referenceModel", () => {
    expect(EVOLINK_ENGINES.hailuo.referenceModel).toBeUndefined();
  });

  it("kling_v3 does NOT have referenceModel", () => {
    expect(EVOLINK_ENGINES.kling_v3.referenceModel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Duration constraints
// ---------------------------------------------------------------------------

describe("EVOLINK_ENGINES — duration constraints", () => {
  const allEngines = Object.entries(EVOLINK_ENGINES);

  it("hailuo has minDuration of 6", () => {
    expect(EVOLINK_ENGINES.hailuo.minDuration).toBe(6);
  });

  it("hailuo_fast has minDuration of 6", () => {
    expect(EVOLINK_ENGINES.hailuo_fast.minDuration).toBe(6);
  });

  it("sora_2 maxDuration is 12", () => {
    expect(EVOLINK_ENGINES.sora_2.maxDuration).toBe(12);
  });

  it("all engines have maxDuration > 0 and <= 60", () => {
    for (const [, config] of allEngines) {
      expect(config.maxDuration).toBeGreaterThan(0);
      expect(config.maxDuration).toBeLessThanOrEqual(60);
    }
  });

  it("minDuration (when set) is always < maxDuration", () => {
    for (const [, config] of allEngines) {
      if (config.minDuration) {
        expect(config.minDuration).toBeLessThan(config.maxDuration);
      }
    }
  });
});
