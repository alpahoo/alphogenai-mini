import { describe, it, expect } from "vitest";
import {
  parseJoggEnvelope,
  parsePhotoAvatarMotion,
  parseProductVideo,
} from "../jogg-client";

describe("parseJoggEnvelope", () => {
  it("returns data on code 0", () => {
    expect(parseJoggEnvelope({ code: 0, data: { product_id: "p1" } }, "/product")).toEqual({ product_id: "p1" });
  });
  it("returns data when code is absent", () => {
    expect(parseJoggEnvelope({ data: { x: 1 } }, "/x")).toEqual({ x: 1 });
  });
  it("throws on a non-zero code, surfacing the code", () => {
    expect(() => parseJoggEnvelope({ code: 18001, msg: "Parameter error" }, "/create")).toThrow(/18001/);
  });
  it("falls back to the whole object when there is no data key", () => {
    expect(parseJoggEnvelope({ status: "processing" }, "/x")).toEqual({ status: "processing" });
  });
});

describe("parseProductVideo", () => {
  it("completed with video_url", () => {
    expect(parseProductVideo({ status: "success", video_url: "https://v/x.mp4" })).toEqual({
      status: "completed",
      videoUrl: "https://v/x.mp4",
    });
  });
  it("treats presence of video_url as completed regardless of state string", () => {
    expect(parseProductVideo({ status: "processing", video_url: "u" }).status).toBe("completed");
  });
  it("throws if a terminal state carries no video_url", () => {
    expect(() => parseProductVideo({ status: "completed" })).toThrow(/no video_url/);
  });
  it("failed maps to a failed result with the message", () => {
    expect(parseProductVideo({ status: "failed", error_message: "nope" })).toEqual({
      status: "failed",
      error: "nope",
    });
  });
  it("pending / queued → pending", () => {
    expect(parseProductVideo({ status: "queued" }).status).toBe("pending");
    expect(parseProductVideo({ status: "pending" }).status).toBe("pending");
  });
  it("unknown non-terminal state → processing", () => {
    expect(parseProductVideo({ status: "rendering" }).status).toBe("processing");
  });
});

describe("parsePhotoAvatarMotion", () => {
  it("maps a completed presenter and keeps its reusable avatar id", () => {
    expect(
      parsePhotoAvatarMotion({
        status: "success",
        avatar_id: 1234,
        motion_id: "motion-1",
      }),
    ).toEqual({
      status: "completed",
      avatarId: "1234",
      motionId: "motion-1",
    });
  });

  it("supports nested provider responses", () => {
    expect(
      parsePhotoAvatarMotion({
        photo_avatar: {
          avatar_status: "processing",
          avatar_id: "55",
          motion_id: "m-2",
        },
      }),
    ).toEqual({
      status: "processing",
      avatarId: "55",
      motionId: "m-2",
    });
  });

  it("maps queued and failed states without exposing response internals", () => {
    expect(parsePhotoAvatarMotion({ status: "queued" }).status).toBe("pending");
    expect(
      parsePhotoAvatarMotion({ status: "failed", error_message: "bad face" }),
    ).toEqual({ status: "failed", error: "bad face" });
  });

  it("keeps a queued task before the reusable avatar id is assigned", () => {
    expect(
      parsePhotoAvatarMotion({ status: "queued", motion_id: "motion-later" }),
    ).toEqual({ status: "pending", motionId: "motion-later" });
  });
});
