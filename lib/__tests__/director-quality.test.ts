import { describe, it, expect } from "vitest";
import { computeDirectorQuality, type DirectorQualityInput } from "../director-quality";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

function input(overrides: Partial<DirectorQualityInput> = {}): DirectorQualityInput {
  return {
    prompt: "A cinematic shot of a city skyline at golden hour, slow dolly-in.",
    scenes: [{ durationSec: 5 }, { durationSec: 5 }],
    hasFace: false,
    hasRawImage: false,
    engineCompat: { isAuto: false, isBytePlus2: true, supportsRefs: true },
    selectedEngineKey: "seedance2_fast_byteplus",
    aspectRatio: "16:9",
    ...overrides,
  };
}

describe("computeDirectorQuality", () => {
  it("prompt: blocks copyrighted IP → risky", () => {
    const q = computeDirectorQuality(input({ prompt: "Spider-Man fighting in a Disney castle" }));
    expect(q.prompt.tone).toBe("risky");
    expect(q.prompt.label).toBe("Review prompt");
  });

  it("prompt: age-word warning → medium 'Caution'", () => {
    const q = computeDirectorQuality(input({ prompt: "A child playing in a park, wide shot, soft light" }));
    expect(q.prompt.tone).toBe("medium");
    expect(q.prompt.label).toBe("Caution");
  });

  it("prompt: clean detailed prompt → good; thin → risky", () => {
    expect(computeDirectorQuality(input()).prompt.tone).toBe("good");
    expect(computeDirectorQuality(input({ prompt: "hi" })).prompt.tone).toBe("risky");
  });

  it("cost: Seedance model → token-based estimate; otherwise deferred", () => {
    expect(computeDirectorQuality(input({ selectedEngineKey: "seedance2_fast_byteplus" })).costLabel).toMatch(/^~\$\d/);
    expect(computeDirectorQuality(input({ selectedEngineKey: "wan_i2v" })).costLabel).toBe("Estimated after plan");
    expect(computeDirectorQuality(input({ selectedEngineKey: "auto" })).costLabel).toBe("Estimated after plan");
  });

  it("social fit: aspect ratio + total duration", () => {
    expect(computeDirectorQuality(input({ aspectRatio: "9:16" })).social).toEqual({
      label: "TikTok / Reels OK",
      tone: "good",
    });
    expect(
      computeDirectorQuality(input({ aspectRatio: "9:16", scenes: [{ durationSec: 200 }] })).social.tone,
    ).toBe("medium");
    expect(computeDirectorQuality(input({ aspectRatio: "1:1" })).social.label).toBe("Square / Feed");
    expect(computeDirectorQuality(input({ aspectRatio: "16:9" })).social.label).toBe("Landscape / YouTube");
  });

  it("character: verified face → High; raw image → Medium; none → None", () => {
    expect(computeDirectorQuality(input({ hasFace: true })).character.label).toBe("High");
    expect(computeDirectorQuality(input({ hasRawImage: true })).character.label).toBe("Medium");
    expect(computeDirectorQuality(input()).character.label).toBe("None");
  });

  it("model: verified face works on its model (good) vs needs the right model (medium)", () => {
    expect(computeDirectorQuality(input({ hasFace: true, engineCompat: { isAuto: false, isBytePlus2: true, supportsRefs: true } })).model.tone).toBe("good");
    expect(computeDirectorQuality(input({ hasFace: true, engineCompat: { isAuto: false, isBytePlus2: false, supportsRefs: true } })).model.tone).toBe("medium");
  });

  it("anti provider-leak: no output label exposes a provider/aggregator name", () => {
    const variants: DirectorQualityInput[] = [
      input(),
      input({ hasFace: true, engineCompat: { isAuto: false, isBytePlus2: false, supportsRefs: true } }),
      input({ hasRawImage: true, engineCompat: { isAuto: false, isBytePlus2: true, supportsRefs: false } }),
      input({ selectedEngineKey: "seedance2_atlas" }),
      input({ selectedEngineKey: "wan_26_bailian" }),
      input({ selectedEngineKey: "heygen_avatar_iv", engineCompat: { isAuto: true, isBytePlus2: false, supportsRefs: true } }),
      input({ prompt: "Spider-Man in a Disney castle" }),
    ];
    for (const v of variants) {
      const q = computeDirectorQuality(v);
      const labels = [q.character.label, q.prompt.label, q.model.label, q.social.label, q.costLabel, q.timeLabel];
      for (const l of labels) {
        expect(FORBIDDEN_RE.test(l), `"${l}" leaks a provider`).toBe(false);
      }
    }
  });
});
