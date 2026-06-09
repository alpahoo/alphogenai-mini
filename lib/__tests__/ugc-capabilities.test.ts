import { describe, expect, it } from "vitest";
import {
  getUGCModelCapabilities,
  isStrongProductGrounding,
  resolveUGCCapabilityEngine,
  supportsExactTryOn,
} from "@/lib/ugc-capabilities";
import type { EngineKey } from "@/lib/types";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

function publicText(engine: EngineKey | "auto"): string {
  const caps = getUGCModelCapabilities(engine);
  return [
    caps.publicModelName,
    caps.productGrounding,
    caps.logoText,
    caps.outfitStyle,
    caps.exactTryOn,
    caps.verifiedIdentity,
    ...caps.recommendedUses,
    ...caps.cautions,
  ].join("\n");
}

describe("UGC model capability matrix", () => {
  it("resolves Auto to the same fast model used by AI Director", () => {
    expect(resolveUGCCapabilityEngine("auto")).toBe("seedance2_fast_byteplus");
    expect(getUGCModelCapabilities("auto").publicModelName).toContain("Auto");
  });

  it("marks verified-face direct models as strong product + identity choices", () => {
    const caps = getUGCModelCapabilities("seedance2_byteplus");

    expect(caps.productGrounding).toBe("supported");
    expect(caps.verifiedIdentity).toBe("validated");
    expect(caps.maxReliableDurationSec).toBe(15);
    expect(isStrongProductGrounding("seedance2_byteplus")).toBe(true);
  });

  it("keeps exact try-on unavailable until a model is validated", () => {
    const engines: Array<EngineKey | "auto"> = [
      "auto",
      "seedance2_byteplus",
      "seedance2_fast_atlas",
      "kling_o3",
      "heygen_avatar_iv",
      "wan_i2v",
    ];

    for (const engine of engines) {
      expect(getUGCModelCapabilities(engine).exactTryOn).toBe("none");
      expect(supportsExactTryOn(engine)).toBe(false);
    }
  });

  it("distinguishes avatar presentation from product grounding", () => {
    const presenter = getUGCModelCapabilities("heygen_avatar_iv");
    const cinematic = getUGCModelCapabilities("heygen_avatar_shots");

    expect(presenter.verifiedIdentity).toBe("supported");
    expect(presenter.productGrounding).toBe("none");
    expect(cinematic.verifiedIdentity).toBe("supported");
    expect(cinematic.productGrounding).toBe("best_effort");
  });

  it("uses cautious defaults for unknown or generic video engines", () => {
    const caps = getUGCModelCapabilities("wan_27");

    expect(caps.productGrounding).toBe("best_effort");
    expect(caps.logoText).toBe("none");
    expect(caps.outfitStyle).toBe("best_effort");
    expect(caps.cautions.join(" ")).toContain("best-effort");
  });

  it("keeps all public capability labels provider-neutral", () => {
    const engines: Array<EngineKey | "auto"> = [
      "auto",
      "seedance2_byteplus",
      "seedance2_fast_byteplus",
      "seedance2_atlas",
      "seedance2_fast_atlas",
      "evolink",
      "evolink_fast",
      "wan_26_bailian",
      "heygen_avatar_iv",
      "heygen_avatar_shots",
      "sora_2",
      "wan_i2v",
    ];

    for (const engine of engines) {
      expect(FORBIDDEN_RE.test(publicText(engine)), publicText(engine)).toBe(false);
    }
  });
});
