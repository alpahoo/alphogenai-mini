import { describe, expect, it } from "vitest";
import { buildUGCDirectorPlan, type BuildUGCPlanInput } from "@/lib/ugc-director";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

function input(overrides: Partial<BuildUGCPlanInput> = {}): BuildUGCPlanInput {
  return {
    product: { label: "image 1", placeholder: "image 1" },
    outfit: { label: "image 2", placeholder: "image 2" },
    angle: "product_demo",
    platform: "tiktok_reels",
    creator: "verified_face",
    productName: "the linen jacket",
    keyBenefit: "breathable premium texture",
    tone: "warm, confident, creator-led",
    ...overrides,
  };
}

describe("buildUGCDirectorPlan", () => {
  it("builds a 6-scene UGC plan when product and outfit references exist", () => {
    const plan = buildUGCDirectorPlan(input());

    expect(plan.aspectRatio).toBe("9:16");
    expect(plan.recommendedSceneCount).toBe(6);
    expect(plan.scenes.map((s) => s.role)).toEqual([
      "hook",
      "problem",
      "demo",
      "style",
      "benefit",
      "cta",
    ]);
    expect(plan.prompt).toContain("Product reference: image 1");
    expect(plan.prompt).toContain("Outfit/style reference: image 2");
    expect(plan.scenes[3].prompt).toContain("not an exact try-on guarantee");
  });

  it("omits the style scene when no outfit reference is supplied", () => {
    const plan = buildUGCDirectorPlan(input({ outfit: null, angle: "testimonial" }));

    expect(plan.recommendedSceneCount).toBe(5);
    expect(plan.scenes.map((s) => s.role)).not.toContain("style");
    expect(plan.prompt).not.toContain("Outfit/style reference");
  });

  it("maps platforms to the create-flow aspect ratio contract", () => {
    expect(buildUGCDirectorPlan(input({ platform: "tiktok_reels" })).aspectRatio).toBe("9:16");
    expect(buildUGCDirectorPlan(input({ platform: "square_feed" })).aspectRatio).toBe("1:1");
    expect(buildUGCDirectorPlan(input({ platform: "landscape_ad" })).aspectRatio).toBe("16:9");
  });

  it("adapts copy by angle and creator mode", () => {
    const founder = buildUGCDirectorPlan(input({ angle: "founder_pitch", creator: "saved_look" }));
    expect(founder.scenes[0].prompt).toContain("founder-style");
    expect(founder.scenes[0].prompt).toContain("Reuse the selected saved Look");

    const tryOn = buildUGCDirectorPlan(input({ angle: "try_on", creator: "none" }));
    expect(tryOn.scenes[0].prompt).toContain("outfit reveal");
    expect(tryOn.scenes[0].prompt).toContain("No fixed creator identity");
  });

  it("falls back to generic labels for sparse input", () => {
    const plan = buildUGCDirectorPlan({
      product: {},
      angle: "unboxing",
      platform: "square_feed",
      creator: "avatar",
    });

    expect(plan.prompt).toContain("the product");
    expect(plan.prompt).toContain("Product reference: image 1");
    expect(plan.scenes[0].prompt).toContain("Use the selected avatar");
  });

  it("keeps all public labels provider-neutral", () => {
    const variants = [
      input(),
      input({ angle: "before_after", creator: "avatar", platform: "landscape_ad" }),
      input({ angle: "founder_pitch", creator: "saved_look", outfit: null }),
      input({ angle: "testimonial", creator: "none" }),
    ];

    for (const variant of variants) {
      const plan = buildUGCDirectorPlan(variant);
      const publicText = [
        plan.prompt,
        plan.aspectRatio,
        ...plan.scenes.flatMap((scene) => [scene.title, scene.role, scene.prompt, ...scene.assetChips]),
      ].join("\n");
      expect(FORBIDDEN_RE.test(publicText), publicText).toBe(false);
    }
  });
});

