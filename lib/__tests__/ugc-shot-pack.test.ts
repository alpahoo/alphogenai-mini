import { describe, expect, it } from "vitest";
import { buildUGCShotPack } from "@/lib/ugc-shot-pack";
import { buildUGCNativeAdSpec } from "@/lib/ugc-native-ad";
import {
  buildBytePlusUGCNativeAdRequest,
  buildBytePlusUGCShotRequest,
} from "@/lib/providers/byteplus-ugc-shot-provider";
import { validateUGCShotPack } from "@/lib/ugc-shot-provider";
import { buildRevideoProductAdManifest } from "@/lib/revideo-product-ad";

const brief = {
  url: "https://example.com/headphones",
  hostname: "example.com",
  title: "Powerbeats Pro 2",
  description: "Secure-fit earbuds with heart-rate monitoring.",
  imageUrl: "https://cdn.example.com/product-1.jpg",
  imageUrls: ["https://cdn.example.com/product-1.jpg", "https://cdn.example.com/product-2.jpg"],
};

describe("buildUGCShotPack", () => {
  it("builds the three required coherent shot roles", () => {
    const shots = buildUGCShotPack({ brief });
    expect(shots.map((shot) => shot.role)).toEqual([
      "creator_hook",
      "product_demo",
      "lifestyle_cta",
    ]);
    expect(shots.every((shot) => shot.aspectRatio === "9:16")).toBe(true);
    expect(shots.every((shot) => shot.generateAudio === false)).toBe(true);
  });

  it("uses the presenter only for creator-facing shots", () => {
    const presenter = {
      role: "character_face" as const,
      url: "https://cdn.example.com/presenter.mp4",
    };
    const shots = buildUGCShotPack({ brief, presenterVideo: presenter });
    expect(shots[0].references.videos).toEqual([presenter]);
    expect(shots[1].references.videos).toBeUndefined();
    expect(shots[2].references.videos).toEqual([presenter]);
  });

  it("requires a real product reference", () => {
    expect(() => buildUGCShotPack({ brief: { ...brief, imageUrls: [] } })).toThrow(
      "At least one product image"
    );
  });

  it("maps a shot into the provider-neutral BytePlus request", () => {
    const [shot] = buildUGCShotPack({ brief, verifiedAssetIds: ["asset-presenter"] });
    const request = buildBytePlusUGCShotRequest(shot);
    expect(request.engineKey).toBe("seedance2_fast_byteplus");
    expect(request.references?.images).toHaveLength(2);
    expect(request.assetIds).toEqual(["asset-presenter"]);
    expect(request.generateAudio).toBe(false);
    expect(request.aspectRatio).toBe("9:16");
  });

  it("rejects incomplete packs", () => {
    const shots = buildUGCShotPack({ brief });
    expect(() => validateUGCShotPack(shots.slice(0, 2))).toThrow("exactly 3 shots");
  });

  it("builds a restrained Revideo manifest from three ready full-frame shots", () => {
    const shots = buildUGCShotPack({ brief });
    const manifest = buildRevideoProductAdManifest({
      productTitle: brief.title,
      productDescription: brief.description,
      shots: shots.map((shot) => ({
        id: shot.id,
        role: shot.role,
        durationSeconds: shot.durationSeconds,
        videoUrl: `https://cdn.example.com/${shot.role}.mp4`,
      })),
    });

    expect(manifest.shots).toHaveLength(3);
    expect(manifest.shots.map((shot) => shot.videoUrl)).toEqual([
      "https://cdn.example.com/creator_hook.mp4",
      "https://cdn.example.com/product_demo.mp4",
      "https://cdn.example.com/lifestyle_cta.mp4",
    ]);
    expect(manifest.shots[2].cta).toBe("Discover");
  });
});

describe("buildUGCNativeAdSpec", () => {
  it("builds one 15-second native multi-shot ad with synchronized audio", () => {
    const spec = buildUGCNativeAdSpec({ brief, language: "French (France)" });

    expect(spec.durationSeconds).toBe(15);
    expect(spec.aspectRatio).toBe("9:16");
    expect(spec.generateAudio).toBe(true);
    expect(spec.prompt).toContain("[0-4s]");
    expect(spec.prompt).toContain("[4-10s]");
    expect(spec.prompt).toContain("[10-15s]");
    expect(spec.prompt).toContain("French (France)");
    expect(spec.prompt).toContain("No subtitles");
  });

  it("passes product and presenter references through one provider task", () => {
    const presenter = {
      role: "character_face" as const,
      url: "https://cdn.example.com/presenter.mp4",
    };
    const spec = buildUGCNativeAdSpec({
      brief,
      presenterVideo: presenter,
      verifiedAssetIds: ["asset-presenter"],
    });
    const request = buildBytePlusUGCNativeAdRequest(spec);

    expect(request.engineKey).toBe("seedance2_byteplus");
    expect(request.references?.images).toHaveLength(2);
    expect(request.references?.videos).toEqual([presenter]);
    expect(request.assetIds).toEqual(["asset-presenter"]);
    expect(request.generateAudio).toBe(true);
  });

  it("requires a real product reference", () => {
    expect(() => buildUGCNativeAdSpec({ brief: { ...brief, imageUrls: [] } })).toThrow(
      "At least one product image"
    );
  });
});
