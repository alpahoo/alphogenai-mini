import { describe, it, expect } from "vitest";
import {
  getEngineDisplayName,
  ENGINE_DISPLAY_NAMES,
  STAGE_LABELS,
  STAGE_ORDER,
  PLAN_MAX_DURATION,
  PLAN_MAX_SCENES,
  PLAN_LABELS,
  PLAN_DAILY_QUOTA,
} from "../types";

// ---------------------------------------------------------------------------
// 1. getEngineDisplayName()
// ---------------------------------------------------------------------------

describe("getEngineDisplayName", () => {
  it("returns display name for wan_i2v", () => {
    expect(getEngineDisplayName("wan_i2v")).toBe("Wan 2.2 I2V");
  });

  it("returns display name for evolink", () => {
    expect(getEngineDisplayName("evolink")).toBe("Seedance 2.0");
  });

  it("returns display name for sora_2", () => {
    expect(getEngineDisplayName("sora_2")).toBe("Sora 2 Pro");
  });

  it("falls back to raw key for unknown engine", () => {
    expect(getEngineDisplayName("unknown_engine")).toBe("unknown_engine");
  });

  it("returns default for null", () => {
    expect(getEngineDisplayName(null)).toBe("Wan 2.2 I2V");
  });

  it("returns default for undefined", () => {
    expect(getEngineDisplayName(undefined)).toBe("Wan 2.2 I2V");
  });

  it("returns default for empty string", () => {
    expect(getEngineDisplayName("")).toBe("Wan 2.2 I2V");
  });
});

// ---------------------------------------------------------------------------
// 2. ENGINE_DISPLAY_NAMES completeness
// ---------------------------------------------------------------------------

describe("ENGINE_DISPLAY_NAMES", () => {
  const requiredEngines = [
    "wan_i2v", "seedance", "evolink", "evolink_fast",
    "kling_o3", "kling_v3", "wan_26", "wan_27", "wan_26_bailian",
    "happy_horse_10", "hailuo", "hailuo_fast", "sora_2",
  ];

  it.each(requiredEngines)("has display name for %s", (key) => {
    expect(ENGINE_DISPLAY_NAMES[key]).toBeTruthy();
    expect(typeof ENGINE_DISPLAY_NAMES[key]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 3. STAGE_LABELS and STAGE_ORDER
// ---------------------------------------------------------------------------

describe("STAGE_LABELS", () => {
  it("has a label for every stage in STAGE_ORDER", () => {
    for (const stage of STAGE_ORDER) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
      expect(typeof STAGE_LABELS[stage]).toBe("string");
    }
  });

  it("has a label for 'failed' (not in STAGE_ORDER)", () => {
    expect(STAGE_LABELS.failed).toBe("Failed");
  });

  it("queued label is human-readable", () => {
    expect(STAGE_LABELS.queued).toBe("In queue");
  });

  it("completed label is human-readable", () => {
    expect(STAGE_LABELS.completed).toBe("Complete");
  });
});

describe("STAGE_ORDER", () => {
  it("starts with queued", () => {
    expect(STAGE_ORDER[0]).toBe("queued");
  });

  it("ends with completed", () => {
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("completed");
  });

  it("has no duplicates", () => {
    const unique = new Set(STAGE_ORDER);
    expect(unique.size).toBe(STAGE_ORDER.length);
  });

  it("does not include failed (separate terminal state)", () => {
    expect(STAGE_ORDER).not.toContain("failed");
  });
});

// ---------------------------------------------------------------------------
// 4. Plan constants
// ---------------------------------------------------------------------------

describe("PLAN_MAX_DURATION", () => {
  it("free = 5", () => expect(PLAN_MAX_DURATION.free).toBe(5));
  it("pro = 15", () => expect(PLAN_MAX_DURATION.pro).toBe(15));
  it("premium = 120", () => expect(PLAN_MAX_DURATION.premium).toBe(120));

  it("free < pro < premium", () => {
    expect(PLAN_MAX_DURATION.free).toBeLessThan(PLAN_MAX_DURATION.pro);
    expect(PLAN_MAX_DURATION.pro).toBeLessThan(PLAN_MAX_DURATION.premium);
  });
});

describe("PLAN_MAX_SCENES", () => {
  it("free = 1", () => expect(PLAN_MAX_SCENES.free).toBe(1));
  it("pro = 3", () => expect(PLAN_MAX_SCENES.pro).toBe(3));
  it("premium = 10", () => expect(PLAN_MAX_SCENES.premium).toBe(10));
});

describe("PLAN_LABELS", () => {
  it("free = Free", () => expect(PLAN_LABELS.free).toBe("Free"));
  it("pro = Pro", () => expect(PLAN_LABELS.pro).toBe("Pro"));
  it("premium = Premium", () => expect(PLAN_LABELS.premium).toBe("Premium"));
});

// ---------------------------------------------------------------------------
// 5. Daily quota constants
// ---------------------------------------------------------------------------

describe("PLAN_DAILY_QUOTA", () => {
  it("free = 1", () => expect(PLAN_DAILY_QUOTA.free).toBe(1));
  it("pro = 50", () => expect(PLAN_DAILY_QUOTA.pro).toBe(50));
  it("premium = -1 (unlimited)", () => expect(PLAN_DAILY_QUOTA.premium).toBe(-1));

  it("free < pro", () => {
    expect(PLAN_DAILY_QUOTA.free).toBeLessThan(PLAN_DAILY_QUOTA.pro);
  });
});
