import { describe, expect, it } from "vitest";
import {
  buildJobReferenceItem,
  buildJobReferenceStoragePath,
  pickJobReferenceImageSource,
} from "@/lib/job-reference-image";

describe("job reference image helper", () => {
  it("prefers cached thumbnail over scene frame and image_url", () => {
    expect(
      pickJobReferenceImageSource({
        job: {
          id: "job-1",
          image_url: "https://example.com/source.jpg",
          social_exports: { thumbnail: "https://example.com/thumb.jpg" },
        },
        firstScene: { last_frame_url: "https://example.com/frame.jpg" },
        r2PublicUrl: "https://cdn.example.com",
      }),
    ).toEqual({ kind: "thumbnail", url: "https://example.com/thumb.jpg" });
  });

  it("falls back to last frame, then job image, then R2 frame candidate", () => {
    expect(
      pickJobReferenceImageSource({
        job: { id: "job-1", social_exports: {} },
        firstScene: { last_frame_url: "https://example.com/frame.jpg" },
      }),
    ).toEqual({ kind: "last_frame", url: "https://example.com/frame.jpg" });

    expect(
      pickJobReferenceImageSource({
        job: { id: "job-1", image_url: "https://example.com/source.jpg" },
      }),
    ).toEqual({ kind: "image_url", url: "https://example.com/source.jpg" });

    expect(
      pickJobReferenceImageSource({
        job: { id: "job-1" },
        r2PublicUrl: "https://cdn.example.com/",
      }),
    ).toEqual({ kind: "r2_frame", url: "https://cdn.example.com/frames/job-1_scene_00_last.jpg" });
  });

  it("builds user-scoped storage paths from detected MIME", () => {
    expect(buildJobReferenceStoragePath("user-1", "job-1", "uuid", "image/jpeg"))
      .toBe("user-1/job-refs/job-1-uuid.jpg");
    expect(buildJobReferenceStoragePath("user-1", "job-1", "uuid", "image/png"))
      .toBe("user-1/job-refs/job-1-uuid.png");
    expect(() => buildJobReferenceStoragePath("user-1", "job-1", "uuid", "image/gif"))
      .toThrow("Unsupported reference image MIME");
  });

  it("returns an outfit_style reference item, never a character face", () => {
    const reference = buildJobReferenceItem({
      signedUrl: "https://signed.example.com/ref.jpg",
      storagePath: "user-1/job-refs/job-1-uuid.jpg",
      mime: "image/jpeg",
      sourceKind: "last_frame",
    });

    expect(reference).toMatchObject({
      role: "outfit_style",
      url: "https://signed.example.com/ref.jpg",
      storage_path: "user-1/job-refs/job-1-uuid.jpg",
      mime_type: "image/jpeg",
      filename: "job-reference-last_frame.jpg",
      weight: 0.7,
    });
    expect(reference.role).not.toBe("character_face");
  });
});
