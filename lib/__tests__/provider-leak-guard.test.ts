import { describe, it, expect } from "vitest";
import { ENGINE_DISPLAY_NAMES, getEngineDisplayName } from "../types";
import { cleanModelName } from "../engine-intentions";

/**
 * Guard test (T-602 / T-605): public model & engine labels must NEVER expose
 * a provider / aggregator name. Models are fine (Seedance, Wan, Kling, Avatar);
 * providers are not (BytePlus, AtlasCloud, EvoLink, Bailian, Kie.ai, HeyGen).
 *
 * This locks in T-102 + T-605 so a future engine cannot reintroduce a leak.
 */

const FORBIDDEN = ["BytePlus", "AtlasCloud", "EvoLink", "Bailian", "Kie.ai", "HeyGen", "Jogg"];
const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen|jogg/i;

describe("public model labels never leak provider/aggregator names", () => {
  it("ENGINE_DISPLAY_NAMES has no provider name in any value", () => {
    for (const [key, label] of Object.entries(ENGINE_DISPLAY_NAMES)) {
      expect(FORBIDDEN_RE.test(label), `${key} → "${label}" leaks a provider`).toBe(false);
    }
  });

  it("getEngineDisplayName output is provider-free for every known key", () => {
    for (const key of Object.keys(ENGINE_DISPLAY_NAMES)) {
      expect(FORBIDDEN_RE.test(getEngineDisplayName(key))).toBe(false);
    }
  });

  it("cleanModelName strips provider parentheticals (realistic cases)", () => {
    expect(cleanModelName("Avatar IV (HeyGen)")).toBe("Avatar IV");
    expect(cleanModelName("Seedance 2.0 (BytePlus)")).toBe("Seedance 2.0");
    expect(cleanModelName("Seedance 2.0 Fast (AtlasCloud)")).toBe("Seedance 2.0 Fast");
    expect(cleanModelName("WAN 2.7 (Bailian)")).toBe("WAN 2.7");
    expect(cleanModelName("Seedance 2.0 (Kie.ai)")).toBe("Seedance 2.0");
  });

  it("cleanModelName output never contains a forbidden provider name", () => {
    const samples = [
      "Avatar IV (HeyGen)",
      "Seedance 2.0 (BytePlus)",
      "Seedance 2.0 Fast (AtlasCloud)",
      "WAN 2.7 (Bailian)",
      "Seedance 2.0 (Kie.ai)",
      "Seedance 2.0 Fast — EvoLink 720p",
      ...Object.values(ENGINE_DISPLAY_NAMES),
    ];
    for (const s of samples) {
      const cleaned = cleanModelName(s);
      expect(FORBIDDEN_RE.test(cleaned), `"${s}" → "${cleaned}" still leaks`).toBe(false);
    }
  });

  it("cleanModelName keeps product terms (no over-stripping)", () => {
    expect(cleanModelName("Seedance 2.0 (Direct)")).toBe("Seedance 2.0 (Direct)");
    expect(cleanModelName("Avatar Shots (Seedance 2)")).toBe("Avatar Shots (Seedance 2)");
    expect(cleanModelName("Kling O3")).toBe("Kling O3");
    expect(cleanModelName("WAN 2.6")).toBe("WAN 2.6");
  });

  it("FORBIDDEN list and regex stay in sync (meta-check)", () => {
    for (const name of FORBIDDEN) {
      expect(FORBIDDEN_RE.test(name)).toBe(true);
    }
  });

  // ── Jogg (URL → Video) — provider name must never surface (T-102) ──────────
  it("getEngineDisplayName('jogg') is the public label, not the provider", () => {
    expect(getEngineDisplayName("jogg")).toBe("URL to Video");
    expect(FORBIDDEN_RE.test(getEngineDisplayName("jogg"))).toBe(false);
  });

  it("cleanModelName strips 'jogg' if it ever reaches a label", () => {
    expect(FORBIDDEN_RE.test(cleanModelName("jogg"))).toBe(false);
    expect(FORBIDDEN_RE.test(cleanModelName("URL to Video (Jogg)"))).toBe(false);
    // the composed path used by /jobs/[id] and /v/[id]
    expect(FORBIDDEN_RE.test(cleanModelName(getEngineDisplayName("jogg")))).toBe(false);
  });
});
