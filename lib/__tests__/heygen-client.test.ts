import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listOwnedAvatars } from "@/lib/heygen-client";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("heygen-client listOwnedAvatars", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.HEYGEN_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns every usable look inside a custom avatar group", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("avatar_group.list")) {
        return jsonResponse({
          data: {
            avatar_group_list: [
              {
                id: "group_digitalpaho",
                name: "digitalpaho",
                group_type: "PHOTO_AVATAR",
                preview_image_url: "https://img.example/group.jpg",
              },
            ],
          },
        });
      }
      if (target.includes("avatar_group/group_digitalpaho/avatars")) {
        return jsonResponse({
          data: {
            avatar_list: [
              {
                id: "look_1",
                name: "digitalpaho front",
                image_url: "https://img.example/front.jpg",
              },
              {
                id: "look_2",
                name: "digitalpaho close",
                preview_image_url: "https://img.example/close.jpg",
              },
              {
                talking_photo_id: "look_3",
                talking_photo_name: "digitalpaho seated",
              },
            ],
          },
        });
      }
      return jsonResponse({}, false, 404);
    });
    global.fetch = fetchMock as typeof fetch;

    const avatars = await listOwnedAvatars();

    expect(avatars).toEqual([
      {
        avatarId: "look_1",
        name: "digitalpaho front",
        gender: "",
        previewUrl: "https://img.example/front.jpg",
        kind: "talking_photo",
      },
      {
        avatarId: "look_2",
        name: "digitalpaho close",
        gender: "",
        previewUrl: "https://img.example/close.jpg",
        kind: "talking_photo",
      },
      {
        avatarId: "look_3",
        name: "digitalpaho seated",
        gender: "",
        previewUrl: "https://img.example/group.jpg",
        kind: "talking_photo",
      },
    ]);
  });

  it("falls back to the group avatar when variants cannot be fetched", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("avatar_group.list")) {
        return jsonResponse({
          data: {
            avatar_group_list: [
              {
                id: "group_lady1",
                name: "Lady1",
                preview_image_url: "https://img.example/lady1.jpg",
              },
            ],
          },
        });
      }
      return jsonResponse({ error: "failed" }, false, 500);
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(listOwnedAvatars()).resolves.toEqual([
      {
        avatarId: "group_lady1",
        name: "Lady1",
        gender: "",
        previewUrl: "https://img.example/lady1.jpg",
        kind: "avatar",
      },
    ]);
  });
});
