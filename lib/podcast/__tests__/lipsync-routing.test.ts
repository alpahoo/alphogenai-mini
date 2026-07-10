import { describe, expect, it } from "vitest";
import {
  DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE,
  getPodcastLipsyncQualityPreset,
  isPodcastLipsyncQualityMode,
  listPodcastLipsyncQualityPresets,
  PODCAST_LIPSYNC_QUALITY_MODES,
  resolvePodcastLipsyncRoutingPlan,
} from "../lipsync-routing";

describe("podcast lip-sync quality routing", () => {
  it("keeps premium as the production default", () => {
    const plan = resolvePodcastLipsyncRoutingPlan();

    expect(DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE).toBe("premium");
    expect(plan.requestedQualityMode).toBe("premium");
    expect(plan.effectiveQualityMode).toBe("premium");
    expect(plan.providerId).toBe("heygen");
    expect(plan.providerMode).toBe("precision");
    expect(plan.status).toBe("available");
    expect(plan.fallbackReason).toBeUndefined();
  });

  it("falls back to premium for planned modes until they are explicitly enabled", () => {
    const plan = resolvePodcastLipsyncRoutingPlan({ qualityMode: "economy" });

    expect(plan.requestedQualityMode).toBe("economy");
    expect(plan.effectiveQualityMode).toBe("premium");
    expect(plan.providerId).toBe("heygen");
    expect(plan.providerMode).toBe("precision");
    expect(plan.fallbackReason).toContain("economy");
  });

  it("can expose planned routing for internal benchmarks", () => {
    const plan = resolvePodcastLipsyncRoutingPlan({ qualityMode: "economy", allowPlanned: true });

    expect(plan.requestedQualityMode).toBe("economy");
    expect(plan.effectiveQualityMode).toBe("economy");
    expect(plan.providerId).toBe("heygen");
    expect(plan.providerMode).toBe("speed");
    expect(plan.status).toBe("planned");
  });

  it("defaults invalid input to the production mode", () => {
    expect(resolvePodcastLipsyncRoutingPlan({ qualityMode: "runway" }).effectiveQualityMode).toBe("premium");
    expect(resolvePodcastLipsyncRoutingPlan({ qualityMode: null }).effectiveQualityMode).toBe("premium");
  });

  it("keeps public labels provider-neutral", () => {
    const forbidden = /heygen|runway|latentsync|musetalk|seedance|elevenlabs/i;

    for (const preset of listPodcastLipsyncQualityPresets()) {
      expect(preset.publicLabel).not.toMatch(forbidden);
      expect(preset.publicDescription).not.toMatch(forbidden);
    }
  });

  it("lists all product-facing quality modes", () => {
    expect(PODCAST_LIPSYNC_QUALITY_MODES).toEqual(["economy", "balanced", "premium", "cinema"]);
    expect(listPodcastLipsyncQualityPresets().map((preset) => preset.id)).toEqual(PODCAST_LIPSYNC_QUALITY_MODES);
  });

  it("validates quality mode strings", () => {
    expect(isPodcastLipsyncQualityMode("cinema")).toBe(true);
    expect(isPodcastLipsyncQualityMode("heygen")).toBe(false);
  });

  it("exposes internal notes separately from public copy", () => {
    expect(getPodcastLipsyncQualityPreset("cinema").internalNote).toMatch(/Runway|Act-Two/i);
    expect(getPodcastLipsyncQualityPreset("cinema").publicDescription).not.toMatch(/Runway|Act-Two/i);
  });
});
