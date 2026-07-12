import { describe, expect, it } from "vitest";
import {
  DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE,
  getPublicPodcastLipsyncQualityPreset,
  isPodcastLipsyncQualityMode,
  listPublicPodcastLipsyncQualityPresets,
  PODCAST_LIPSYNC_QUALITY_MODES,
  resolvePublicPodcastLipsyncQualitySelection,
} from "../lipsync-quality";

const INTERNAL_PROVIDER_NAMES = /heygen|runway|act-two|latentsync|musetalk|seedance|elevenlabs|openai/i;

describe("public podcast lip-sync quality contract", () => {
  it("exposes all product modes without internal routing fields", () => {
    const presets = listPublicPodcastLipsyncQualityPresets();

    expect(presets.map((preset) => preset.id)).toEqual(PODCAST_LIPSYNC_QUALITY_MODES);
    for (const preset of presets) {
      expect(Object.keys(preset).sort()).toEqual(["description", "id", "label", "status"]);
      expect(JSON.stringify(preset)).not.toMatch(INTERNAL_PROVIDER_NAMES);
      expect(preset).not.toHaveProperty("providerId");
      expect(preset).not.toHaveProperty("providerMode");
      expect(preset).not.toHaveProperty("internalNote");
    }
  });

  it("keeps Premium as the public production default", () => {
    expect(DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE).toBe("premium");
    expect(getPublicPodcastLipsyncQualityPreset("premium").status).toBe("available");
  });

  it("returns a provider-neutral fallback notice for planned modes", () => {
    const selection = resolvePublicPodcastLipsyncQualitySelection("cinema");

    expect(selection).toEqual({
      requestedMode: "cinema",
      effectiveMode: "premium",
      fallbackNotice: "Using Premium today",
    });
    expect(JSON.stringify(selection)).not.toMatch(INTERNAL_PROVIDER_NAMES);
  });

  it("does not add a fallback notice for the available mode", () => {
    expect(resolvePublicPodcastLipsyncQualitySelection("premium")).toEqual({
      requestedMode: "premium",
      effectiveMode: "premium",
    });
  });

  it("defaults invalid input and validates only product modes", () => {
    expect(resolvePublicPodcastLipsyncQualitySelection("runway").effectiveMode).toBe("premium");
    expect(isPodcastLipsyncQualityMode("balanced")).toBe(true);
    expect(isPodcastLipsyncQualityMode("heygen")).toBe(false);
  });
});
