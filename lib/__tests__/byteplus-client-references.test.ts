import { afterEach, describe, expect, it, vi } from "vitest";
import { createBytePlusTask } from "@/lib/byteplus-client";

const originalFetch = global.fetch;
const originalKey = process.env.BYTEPLUS_ARK_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.BYTEPLUS_ARK_API_KEY;
  else process.env.BYTEPLUS_ARK_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("createBytePlusTask multimodal references", () => {
  it("keeps product references when a verified face asset is present", async () => {
    process.env.BYTEPLUS_ARK_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ task_id: "task-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    global.fetch = fetchMock;

    await createBytePlusTask({
      engineKey: "seedance2_fast_byteplus",
      prompt: "Create one coherent UGC shot.",
      duration: 5,
      assetIds: ["asset-presenter"],
      references: {
        images: [
          { role: "character_face", url: "https://cdn.example.com/raw-face.jpg" },
          { role: "product_reference", url: "https://cdn.example.com/product.jpg" },
        ],
        videos: [
          { role: "character_face", url: "https://cdn.example.com/performance.mp4" },
        ],
        audio: [{ role: "mood", url: "https://cdn.example.com/reference.mp3" }],
      },
      generateAudio: false,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const urls = body.content.map(
      (item: Record<string, { url?: string }>) =>
        item.image_url?.url ?? item.video_url?.url ?? item.audio_url?.url
    );

    expect(urls).toContain("asset://asset-presenter");
    expect(urls).toContain("https://cdn.example.com/product.jpg");
    expect(urls).not.toContain("https://cdn.example.com/raw-face.jpg");
    expect(urls).toContain("https://cdn.example.com/performance.mp4");
    expect(urls).toContain("https://cdn.example.com/reference.mp3");
    expect(body.generate_audio).toBe(false);
  });
});
