import { describe, expect, it } from "vitest";
import { getUGCSocialPreset, type UGCSocialPlatform } from "@/lib/ugc-social-pack";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

describe("getUGCSocialPreset", () => {
  it.each([
    ["tiktok_reels", "9:16", "TikTok / Reels launch"],
    ["square_feed", "1:1", "Instagram feed proof"],
    ["landscape_ad", "16:9", "Landscape ad cut"],
  ] as [UGCSocialPlatform, string, string][])("returns the %s preset", (platform, aspect, label) => {
    const preset = getUGCSocialPreset(platform);

    expect(preset.aspectRatio).toBe(aspect);
    expect(preset.label).toBe(label);
    expect(preset.captionMode).toBe("auto");
    expect(preset.primaryFormats.length).toBeGreaterThan(0);
    expect(preset.hashtagHints.every((tag) => tag.startsWith("#"))).toBe(true);
  });

  it("keeps preset copy provider-neutral", () => {
    const text = (["tiktok_reels", "square_feed", "landscape_ad"] as UGCSocialPlatform[])
      .map((platform) => {
        const preset = getUGCSocialPreset(platform);
        return [
          preset.label,
          preset.metadataBrief,
          preset.hookGuidance,
          preset.ctaGuidance,
          ...preset.primaryFormats,
          ...preset.hashtagHints,
        ].join("\n");
      })
      .join("\n");

    expect(FORBIDDEN_RE.test(text), text).toBe(false);
  });
});
