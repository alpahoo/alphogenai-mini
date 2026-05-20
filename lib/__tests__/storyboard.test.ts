import { describe, it, expect } from "vitest";
import {
  generateStoryboard,
  parseUserScenes,
  isValidPlan,
  MAX_SCENES,
} from "../storyboard";
import type { JobPlan } from "../types";

// ---------------------------------------------------------------------------
// 1. isValidPlan()
// ---------------------------------------------------------------------------

describe("isValidPlan", () => {
  it("accepts free", () => expect(isValidPlan("free")).toBe(true));
  it("accepts pro", () => expect(isValidPlan("pro")).toBe(true));
  it("accepts premium", () => expect(isValidPlan("premium")).toBe(true));
  it("rejects empty string", () => expect(isValidPlan("")).toBe(false));
  it("rejects arbitrary string", () => expect(isValidPlan("enterprise")).toBe(false));
  it("rejects null", () => expect(isValidPlan(null)).toBe(false));
  it("rejects undefined", () => expect(isValidPlan(undefined)).toBe(false));
  it("rejects number", () => expect(isValidPlan(42)).toBe(false));
});

// ---------------------------------------------------------------------------
// 2. MAX_SCENES constants
// ---------------------------------------------------------------------------

describe("MAX_SCENES", () => {
  it("free = 1", () => expect(MAX_SCENES.free).toBe(1));
  it("pro = 3", () => expect(MAX_SCENES.pro).toBe(3));
  it("premium = 24", () => expect(MAX_SCENES.premium).toBe(24));
});

// ---------------------------------------------------------------------------
// 3. generateStoryboard — free plan
// ---------------------------------------------------------------------------

describe("generateStoryboard — free plan", () => {
  it("always returns exactly 1 scene", () => {
    const sb = generateStoryboard("test prompt", 15, "free");
    expect(sb).toHaveLength(1);
  });

  it("caps duration to 5s (DEFAULT_CLIP_DURATION)", () => {
    const sb = generateStoryboard("test prompt", 30, "free");
    expect(sb[0].duration_sec).toBeLessThanOrEqual(5);
  });

  it("scene_index is 0", () => {
    const sb = generateStoryboard("test prompt", 5, "free");
    expect(sb[0].scene_index).toBe(0);
  });

  it("uses DEFAULT_ENGINE (wan_i2v)", () => {
    const sb = generateStoryboard("test prompt", 5, "free");
    expect(sb[0].engine).toBe("wan_i2v");
  });

  it("prompt is the original trimmed prompt (no scene markers for single scene)", () => {
    const sb = generateStoryboard("  a cat jumping  ", 5, "free");
    expect(sb[0].prompt).toBe("a cat jumping");
  });
});

// ---------------------------------------------------------------------------
// 4. generateStoryboard — pro plan
// ---------------------------------------------------------------------------

describe("generateStoryboard — pro plan", () => {
  it("generates multiple scenes for longer duration", () => {
    const sb = generateStoryboard("epic battle", 15, "pro");
    expect(sb.length).toBeGreaterThan(1);
  });

  it("never exceeds 3 scenes (MAX_SCENES.pro)", () => {
    const sb = generateStoryboard("epic battle", 60, "pro");
    expect(sb.length).toBeLessThanOrEqual(3);
  });

  it("unstructured multi-scene prompts have scene markers", () => {
    const sb = generateStoryboard("epic battle", 15, "pro");
    if (sb.length > 1) {
      expect(sb[0].prompt).toContain("[Scene 1/");
      expect(sb[1].prompt).toContain("[Scene 2/");
    }
  });

  it("total duration approximately matches target", () => {
    const sb = generateStoryboard("epic battle", 15, "pro");
    const total = sb.reduce((s, sc) => s + sc.duration_sec, 0);
    expect(total).toBeGreaterThanOrEqual(10);
    expect(total).toBeLessThanOrEqual(15);
  });

  it("scene_index values are sequential from 0", () => {
    const sb = generateStoryboard("epic battle", 15, "pro");
    sb.forEach((sc, i) => {
      expect(sc.scene_index).toBe(i);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. generateStoryboard — premium plan
// ---------------------------------------------------------------------------

describe("generateStoryboard — premium plan", () => {
  it("never exceeds 24 scenes (MAX_SCENES.premium)", () => {
    const sb = generateStoryboard("long film", 120, "premium");
    expect(sb.length).toBeLessThanOrEqual(24);
  });

  it("generates more scenes than pro for same duration", () => {
    const sbPro = generateStoryboard("long film", 25, "pro");
    const sbPrem = generateStoryboard("long film", 25, "premium");
    expect(sbPrem.length).toBeGreaterThanOrEqual(sbPro.length);
  });
});

// ---------------------------------------------------------------------------
// 6. generateStoryboard — duration clamping
// ---------------------------------------------------------------------------

describe("generateStoryboard — duration clamping", () => {
  it("clamps very small duration to MIN_CLIP_DURATION (3s)", () => {
    const sb = generateStoryboard("test", 1, "free");
    expect(sb[0].duration_sec).toBeGreaterThanOrEqual(3);
  });

  it("never produces a scene shorter than 3s", () => {
    const plans: JobPlan[] = ["free", "pro", "premium"];
    for (const plan of plans) {
      const sb = generateStoryboard("test", 30, plan);
      for (const sc of sb) {
        expect(sc.duration_sec).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("remainder shorter than 3s is absorbed into previous scene", () => {
    // 13s target with 5s clips → scenes: 5+5+3=13. If remainder <3s it
    // would be absorbed. With 5s clips and 13s target, ceil(13/5)=3 scenes.
    const sb = generateStoryboard("test", 13, "pro");
    for (const sc of sb) {
      expect(sc.duration_sec).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. parseUserScenes — structured prompt detection
// ---------------------------------------------------------------------------

describe("parseUserScenes", () => {
  it("returns null for unstructured prompts", () => {
    expect(parseUserScenes("a cat jumping over a fence")).toBeNull();
  });

  it("returns null for single scene marker", () => {
    expect(parseUserScenes("[SCENE 1] A cat jumping")).toBeNull();
  });

  it("parses two scenes", () => {
    const result = parseUserScenes(
      "[SCENE 1] A cat jumping\n[SCENE 2] A dog running"
    );
    expect(result).toHaveLength(2);
    expect(result![0].prompt).toBe("A cat jumping");
    expect(result![1].prompt).toBe("A dog running");
  });

  it("parses scenes with labels", () => {
    const result = parseUserScenes(
      "[SCENE 1 - INTRO] Dark warehouse\n[SCENE 2 - ACTION] Car chase"
    );
    expect(result).toHaveLength(2);
    expect(result![0].label).toBe("SCENE 1 - INTRO");
    expect(result![0].prompt).toBe("Dark warehouse");
    expect(result![1].label).toBe("SCENE 2 - ACTION");
    expect(result![1].prompt).toBe("Car chase");
  });

  it("handles multi-line scene prompts", () => {
    const result = parseUserScenes(
      "[SCENE 1] A dark room, tense atmosphere\ncinematic lighting, close-up\n\n[SCENE 2] Car speeding through city"
    );
    expect(result).toHaveLength(2);
    expect(result![0].prompt).toContain("tense atmosphere");
    expect(result![0].prompt).toContain("cinematic lighting");
  });

  it("is case-insensitive", () => {
    const result = parseUserScenes(
      "[scene 1] First\n[Scene 2] Second\n[SCENE 3] Third"
    );
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 8. generateStoryboard — structured scene prompts
// ---------------------------------------------------------------------------

describe("generateStoryboard — structured scenes", () => {
  const structuredPrompt = [
    "[SCENE 1 - PREPARATION] Inside a dark warehouse, thieves preparing equipment",
    "[SCENE 2 - THE PLAN] Close-up of nervous faces, tactical discussion",
    "[SCENE 3 - ARRIVAL] Black van stopping near a building at night",
    "[SCENE 4 - INFILTRATION] Two figures entering through a service entrance",
  ].join("\n\n");

  it("splits structured prompt into individual scenes (premium)", () => {
    const sb = generateStoryboard(structuredPrompt, 60, "premium");
    expect(sb).toHaveLength(4);
    expect(sb[0].prompt).toContain("warehouse");
    expect(sb[0].prompt).not.toContain("[SCENE");
    expect(sb[1].prompt).toContain("nervous faces");
    expect(sb[2].prompt).toContain("van stopping");
    expect(sb[3].prompt).toContain("service entrance");
  });

  it("each scene has a distinct prompt", () => {
    const sb = generateStoryboard(structuredPrompt, 60, "premium");
    const prompts = sb.map((s) => s.prompt);
    const unique = new Set(prompts);
    expect(unique.size).toBe(sb.length);
  });

  it("caps scenes to plan limit (pro = 3)", () => {
    const sb = generateStoryboard(structuredPrompt, 15, "pro");
    expect(sb.length).toBeLessThanOrEqual(3);
  });

  it("distributes duration evenly across user scenes", () => {
    const sb = generateStoryboard(structuredPrompt, 20, "premium");
    expect(sb).toHaveLength(4);
    expect(sb[0].duration_sec).toBe(5); // 20s / 4 scenes = 5s each
  });

  it("free plan ignores structured scenes (always 1 scene)", () => {
    const sb = generateStoryboard(structuredPrompt, 5, "free");
    expect(sb).toHaveLength(1);
  });

  it("unstructured prompt still uses duration-based splitting", () => {
    const sb = generateStoryboard("epic battle scene", 15, "pro");
    expect(sb.length).toBeGreaterThan(1);
    expect(sb[0].prompt).toContain("[Scene 1/");
  });
});

// ---------------------------------------------------------------------------
// 9. generateStoryboard — edge cases
// ---------------------------------------------------------------------------

describe("generateStoryboard — edge cases", () => {
  it("defaults to free plan and 5s duration", () => {
    const sb = generateStoryboard("test");
    expect(sb).toHaveLength(1);
    expect(sb[0].duration_sec).toBeLessThanOrEqual(5);
  });

  it("handles empty prompt gracefully", () => {
    const sb = generateStoryboard("", 5, "free");
    expect(sb).toHaveLength(1);
    expect(sb[0].prompt).toBe("");
  });

  it("all scenes have required fields", () => {
    const sb = generateStoryboard("cinematic shot", 15, "pro");
    for (const sc of sb) {
      expect(sc).toHaveProperty("scene_index");
      expect(sc).toHaveProperty("prompt");
      expect(sc).toHaveProperty("engine");
      expect(sc).toHaveProperty("duration_sec");
      expect(typeof sc.scene_index).toBe("number");
      expect(typeof sc.prompt).toBe("string");
      expect(typeof sc.engine).toBe("string");
      expect(typeof sc.duration_sec).toBe("number");
    }
  });

  it("duration_sec values are rounded to 1 decimal", () => {
    const sb = generateStoryboard("test", 7, "pro");
    for (const sc of sb) {
      const str = sc.duration_sec.toString();
      const decimals = str.includes(".") ? str.split(".")[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(1);
    }
  });
});
