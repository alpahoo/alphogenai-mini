import { describe, expect, it } from "vitest";
import { PARALLAX_VIDEO_MODULE, PARALLAX_VIDEO_SURFACES, isParallaxVideoModel } from "./parallax-video";
import { findModel } from "./catalog";

describe("Parallax Video Studio adapter", () => {
  it("pins the reviewed source and keeps the MIT notice beside the adapter", () => {
    expect(PARALLAX_VIDEO_MODULE.sourceCommit).toBe("a98671e3c47fdb12c42789aee821268aa8f23f6c");
    expect(PARALLAX_VIDEO_MODULE.license).toBe("MIT");
    expect(PARALLAX_VIDEO_MODULE.output).toBe("private-video");
  });

  it("uses the existing H3 admin contract for every surface", () => {
    expect(isParallaxVideoModel(PARALLAX_VIDEO_MODULE.model)).toBe(true);
    expect(findModel(PARALLAX_VIDEO_MODULE.model)?.kind).toBe("video");
    expect(PARALLAX_VIDEO_SURFACES).toEqual([
      "reference-library", "generation-preview", "run-history", "private-result",
    ]);
    expect(PARALLAX_VIDEO_MODULE.routes.run).toContain("/api/admin/comfy/runs/");
    expect(PARALLAX_VIDEO_MODULE.routes.media).toContain("/api/admin/comfy/media/");
  });

  it("fails closed for another Studio model", () => {
    expect(isParallaxVideoModel("moss-image")).toBe(false);
    expect(isParallaxVideoModel(undefined)).toBe(false);
  });
});
