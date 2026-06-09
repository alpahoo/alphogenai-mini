import { describe, expect, it } from "vitest";
import { buildAllUGCQAFixtures, UGC_QA_CASES } from "@/lib/ugc-qa-harness";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

function publicFixtureText(fixture: ReturnType<typeof buildAllUGCQAFixtures>[number]): string {
  return [
    fixture.title,
    fixture.capabilities.publicModelName,
    fixture.readiness.label,
    fixture.readiness.detail,
    ...fixture.readiness.checks.map((check) => check.label),
    ...fixture.capabilities.recommendedUses,
    ...fixture.capabilities.cautions,
    ...(fixture.plan
      ? [
          fixture.plan.prompt,
          fixture.plan.social.label,
          fixture.plan.social.metadataBrief,
          ...fixture.plan.scenes.flatMap((scene) => [
            scene.title,
            scene.role,
            scene.prompt,
            ...scene.assetChips,
          ]),
        ]
      : []),
    ...fixture.manualChecks,
  ].join("\n");
}

describe("UGC QA harness", () => {
  it("builds fixtures for every registered QA case", () => {
    const fixtures = buildAllUGCQAFixtures();

    expect(fixtures).toHaveLength(UGC_QA_CASES.length);
    expect(fixtures.map((fixture) => fixture.id)).toEqual(UGC_QA_CASES.map((testCase) => testCase.id));
  });

  it("matches expected readiness for the core grounding scenarios", () => {
    const fixtures = buildAllUGCQAFixtures();

    for (const fixture of fixtures) {
      const testCase = UGC_QA_CASES.find((candidate) => candidate.id === fixture.id);
      expect(fixture.readiness.status, fixture.id).toBe(testCase?.expectedReadiness);
    }
  });

  it("keeps product-grounded cases connected to Director scenes", () => {
    const fixture = buildAllUGCQAFixtures().find((candidate) => candidate.id === "product_grounded_demo");

    expect(fixture?.readiness.status).toBe("product_grounded");
    expect(fixture?.plan?.scenes.some((scene) => scene.role === "demo")).toBe(true);
    expect(fixture?.plan?.scenes[0]?.prompt).toContain("product reference");
  });

  it("documents exact try-on as unavailable without blocking style-direction plans", () => {
    const fixture = buildAllUGCQAFixtures().find((candidate) => candidate.id === "outfit_style_direction");

    expect(fixture?.readiness.status).toBe("exact_tryon_unavailable");
    expect(fixture?.readiness.detail).toContain("exact try-on is not validated yet");
    expect(fixture?.plan?.scenes.some((scene) => scene.role === "style")).toBe(true);
    expect(fixture?.plan?.prompt).toContain("Outfit/style reference");
  });

  it("does not create a product UGC plan for missing-product negative cases", () => {
    const fixture = buildAllUGCQAFixtures().find((candidate) => candidate.id === "style_only_missing_product");

    expect(fixture?.readiness.status).toBe("style_only");
    expect(fixture?.plan).toBeNull();
  });

  it("keeps presenter-only models from pretending to be product-grounding models", () => {
    const fixture = buildAllUGCQAFixtures().find((candidate) => candidate.id === "avatar_presenter_product");

    expect(fixture?.readiness.status).toBe("ready");
    expect(fixture?.readiness.checks).toContainEqual({ label: "Grounding", ok: false });
    expect(fixture?.capabilities.productGrounding).toBe("none");
  });

  it("keeps all public QA fixture copy provider-neutral", () => {
    for (const fixture of buildAllUGCQAFixtures()) {
      const text = publicFixtureText(fixture);
      expect(FORBIDDEN_RE.test(text), text).toBe(false);
    }
  });
});
