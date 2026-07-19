import { describe, expect, it } from "vitest";
import {
  toPublicVideoPresenterRequest,
  validateVideoUpload,
  videoExtension,
  type VideoPresenterRequestRow,
} from "@/lib/video-presenters";

describe("video presenter helpers", () => {
  it("accepts supported source and consent footage", () => {
    expect(validateVideoUpload({ type: "video/mp4", size: 2_000_000 }, "source")).toBeNull();
    expect(validateVideoUpload({ type: "video/quicktime", size: 1_000_000 }, "consent")).toBeNull();
  });

  it("rejects unsupported and oversized uploads", () => {
    expect(validateVideoUpload({ type: "image/jpeg", size: 1_000_000 }, "source")).toMatch(/MP4/);
    expect(validateVideoUpload({ type: "video/mp4", size: 101 * 1024 * 1024 }, "consent")).toMatch(/100 MB/);
  });

  it("maps MIME types to stable extensions", () => {
    expect(videoExtension("video/quicktime")).toBe("mov");
    expect(videoExtension("video/webm")).toBe("webm");
    expect(videoExtension("video/mp4")).toBe("mp4");
  });

  it("does not expose provider identifiers in public request state", () => {
    const row: VideoPresenterRequestRow = {
      id: "request-1",
      user_id: "user-1",
      name: "My Presenter",
      provider_name: "AG-secret-provider-name",
      source_video_path: "user/request/source.mp4",
      consent_video_path: "user/request/consent.mp4",
      source_mime: "video/mp4",
      consent_mime: "video/mp4",
      source_size_bytes: 1_000_000,
      consent_size_bytes: 1_000_000,
      status: "processing",
      external_avatar_id: "445593",
      presenter_id: null,
      error_code: null,
      created_at: "2026-07-19T00:00:00Z",
      updated_at: "2026-07-19T00:00:00Z",
    };
    const output = toPublicVideoPresenterRequest(row);
    expect(output).toMatchObject({ id: "request-1", status: "processing" });
    expect(output).not.toHaveProperty("provider_name");
    expect(output).not.toHaveProperty("external_avatar_id");
  });
});
