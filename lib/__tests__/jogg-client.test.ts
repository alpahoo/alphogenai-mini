import { describe, it, expect, vi } from "vitest";
import {
  createPhotoAvatarMotion,
  createVideoFromProduct,
  generatePhotoAvatar,
  listCustomAvatars,
  listCustomVoices,
  normalizeJoggAvatarAspectRatio,
  parseJoggEnvelope,
  parsePhotoAvatarMotion,
  parsePhotoAvatarGeneration,
  parseProductVideo,
  uploadJoggAsset,
} from "../jogg-client";

describe("product video aspect ratios", () => {
  it("normalizes provider aspect-ratio values", () => {
    expect(normalizeJoggAvatarAspectRatio(0)).toBe("portrait");
    expect(normalizeJoggAvatarAspectRatio("1")).toBe("landscape");
    expect(normalizeJoggAvatarAspectRatio(2)).toBe("square");
    expect(normalizeJoggAvatarAspectRatio("unknown")).toBeNull();
  });

  it.each([
    ["portrait", 1768],
    ["landscape", 1756],
    ["square", 204],
  ] as const)("uses a compatible automatic avatar for %s", async (aspectRatio, avatarId) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, data: { product_video_id: "video-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    process.env.JOGG_API_KEY = "test-key";

    await createVideoFromProduct({ productId: "product-1", aspectRatio });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.video_spec.aspect_ratio).toBe(aspectRatio);
    expect(body.avatar).toEqual({ id: avatarId, type: 0 });
    fetchMock.mockRestore();
  });

  it("sends an existing account avatar such as 445593 as custom type 1", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, data: { product_video_id: "video-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await createVideoFromProduct({
      productId: "product-1",
      avatarId: 445593,
      avatarType: 1,
      aspectRatio: "portrait",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).avatar).toEqual({
      id: 445593,
      type: 1,
    });
    fetchMock.mockRestore();
  });

  it("sends a custom voice with the selected French or English script language", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, data: { product_video_id: "video-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await createVideoFromProduct({
      productId: "product-1",
      avatarId: 445593,
      avatarType: 1,
      voiceId: "tb_custom_voice",
      language: "english",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.voice).toEqual({ id: "tb_custom_voice" });
    expect(body.script.language).toBe("english");
    fetchMock.mockRestore();
  });

  it("keeps the declared format of an account video avatar", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        code: 0,
        data: {
          avatars: [{
            id: 445593,
            name: "gvnahid292",
            avatar_status: "completed",
            aspect_ratio: 1,
            cover_url: "https://res.example/445593.jpg",
          }],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(listCustomAvatars()).resolves.toEqual([
      expect.objectContaining({
        id: 445593,
        kind: "custom",
        type: 1,
        aspectRatio: "landscape",
      }),
    ]);
    fetchMock.mockRestore();
  });

  it("does not invent a portrait constraint when an account avatar omits its format", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        code: 0,
        data: {
          avatars: [{ id: 445593, name: "gvnahid292", avatar_status: "completed" }],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(listCustomAvatars()).resolves.toEqual([
      expect.objectContaining({ id: 445593, aspectRatio: null }),
    ]);
    fetchMock.mockRestore();
  });
});

describe("custom voice catalog", () => {
  it("loads account voices and marks an unspecified-language clone as multilingual", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        code: 0,
        data: {
          voices: [{
            voice_id: "tb_61ddbcd5cebf4387bbb9459d917ca9bc",
            name: "gvnahid292",
            language: "",
            audio_url: "https://res.example/gvnahid292.wav",
          }],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(listCustomVoices()).resolves.toEqual([{
      id: "tb_61ddbcd5cebf4387bbb9459d917ca9bc",
      name: "gvnahid292",
      language: "multilingual",
      gender: "",
      previewUrl: "https://res.example/gvnahid292.wav",
      kind: "custom",
    }]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.jogg.ai/v2/voices/custom");
    fetchMock.mockRestore();
  });
});

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

describe("documented photo avatar workflow", () => {
  it("maps generated photo completion and requires provider images", () => {
    expect(parsePhotoAvatarGeneration({
      photo_id: "photo-1",
      status: "success",
      image_url_list: ["https://res.example/generated.png"],
    })).toEqual({
      status: "completed",
      photoId: "photo-1",
      imageUrls: ["https://res.example/generated.png"],
    });
    expect(() => parsePhotoAvatarGeneration({
      photo_id: "photo-1",
      status: "success",
      image_url_list: [],
    })).toThrow(/no images/i);
  });

  it("starts photo generation with every required provider field", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, data: { photo_id: "photo-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(generatePhotoAvatar({
      imageUrl: "https://res.example/source.jpg",
      gender: "Female",
    })).resolves.toEqual({ photoId: "photo-1" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      age: "Adult",
      avatar_style: "Professional",
      gender: "Female",
      model: "modern",
      aspect_ratio: "portrait",
      image_url: "https://res.example/source.jpg",
    });
    fetchMock.mockRestore();
  });

  it("adds motion only with the generated photo id and selected image", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        code: 0,
        data: { status: "processing", avatar_id: 445593, motion_id: "motion-1" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await createPhotoAvatarMotion({
      photoId: "photo-1",
      imageUrl: "https://res.example/generated.png",
      name: "My presenter",
      voiceId: "voice-1",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      photo_id: "photo-1",
      image_url: "https://res.example/generated.png",
      voice_id: "voice-1",
    });
    fetchMock.mockRestore();
  });
});

describe("uploadJoggAsset", () => {
  it("copies a private portrait through the provider's signed asset upload", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              sign_url: "https://storage.example/upload",
              asset_url: "https://res.example/presenter.jpg",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const assetUrl = await uploadJoggAsset({
      sourceUrl: "https://private.example/signed.jpg",
      filename: "presenter.jpg",
    });

    expect(assetUrl).toBe("https://res.example/presenter.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.jogg.ai/v2/upload/asset");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      filename: "presenter.jpg",
      content_type: "image/jpeg",
      file_size: 3,
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://storage.example/upload");
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
    });
    fetchMock.mockRestore();
  });

  it("refuses an incomplete provider upload reservation", async () => {
    process.env.JOGG_API_KEY = "test-key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { asset_url: "https://res.example/x.jpg" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      uploadJoggAsset({ sourceUrl: "https://private.example/x.jpg", filename: "x.jpg" }),
    ).rejects.toThrow(/incomplete URLs/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
