import { describe, expect, it } from "vitest";
import { clippingExtension, validateClippingPrepare } from "@/lib/clipping-pack";

describe("clipping pack input", () => {
  it("accepts a bounded MP4 pack", () => {
    expect(validateClippingPrepare({ title: "Interview", mime: "video/mp4", size: 25_000_000, clip_count: 3 })).toEqual({
      value: { title: "Interview", mime: "video/mp4", size: 25_000_000, clipCount: 3 },
    });
  });
  it("rejects unsupported files and excessive clip counts", () => {
    expect(validateClippingPrepare({ title: "Audio", mime: "audio/mpeg", size: 100, clip_count: 3 }).error).toMatch(/MP4/);
    expect(validateClippingPrepare({ title: "Video", mime: "video/mp4", size: 100, clip_count: 9 }).error).toMatch(/between 1 and 8/);
    expect(validateClippingPrepare({ title: "Video", mime: "video/mp4", size: 50_000_001, clip_count: 3 }).error).toMatch(/50 MB/);
  });
  it("maps supported extensions", () => {
    expect(clippingExtension("video/quicktime")).toBe("mov");
    expect(clippingExtension("video/webm")).toBe("webm");
    expect(clippingExtension("video/mp4")).toBe("mp4");
  });
});
