import { afterEach, describe, expect, it, vi } from "vitest";
import { createLipsync, getLipsyncTask } from "@/lib/heygen-client";
import {
  getPodcastLipsyncProvider,
  heygenPodcastLipsyncProvider,
  isPodcastLipsyncProviderId,
  latentSyncModalPodcastLipsyncProvider,
} from "../lipsync-provider";

vi.mock("@/lib/heygen-client", () => ({
  createLipsync: vi.fn(),
  getLipsyncTask: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("heygenPodcastLipsyncProvider", () => {
  it("wraps HeyGen createLipsync without changing arguments", async () => {
    vi.mocked(createLipsync).mockResolvedValue("task-123");

    const result = await heygenPodcastLipsyncProvider.createClip({
      videoUrl: "https://cdn.example.com/video.mp4",
      audioUrl: "https://cdn.example.com/audio.mp3",
      mode: "precision",
    });

    expect(result).toEqual({ providerTaskId: "task-123" });
    expect(createLipsync).toHaveBeenCalledWith(
      "https://cdn.example.com/video.mp4",
      "https://cdn.example.com/audio.mp3",
      "precision",
    );
  });

  it("wraps HeyGen getLipsyncTask", async () => {
    vi.mocked(getLipsyncTask).mockResolvedValue({
      status: "completed",
      videoUrl: "https://cdn.example.com/out.mp4",
    });

    const result = await heygenPodcastLipsyncProvider.pollClip("task-123");

    expect(result).toEqual({ status: "completed", videoUrl: "https://cdn.example.com/out.mp4" });
    expect(getLipsyncTask).toHaveBeenCalledWith("task-123");
  });
});

describe("getPodcastLipsyncProvider", () => {
  it("returns registered providers without changing the production default", () => {
    expect(getPodcastLipsyncProvider()).toBe(heygenPodcastLipsyncProvider);
    expect(getPodcastLipsyncProvider("heygen")).toBe(heygenPodcastLipsyncProvider);
    expect(getPodcastLipsyncProvider("latentsync_modal")).toBe(latentSyncModalPodcastLipsyncProvider);
  });

  it("validates persisted provider ids before polling cached tasks", () => {
    expect(isPodcastLipsyncProviderId("heygen")).toBe(true);
    expect(isPodcastLipsyncProviderId("latentsync_modal")).toBe(true);
    expect(isPodcastLipsyncProviderId("runway")).toBe(false);
    expect(isPodcastLipsyncProviderId(null)).toBe(false);
  });
});

describe("latentSyncModalPodcastLipsyncProvider", () => {
  it("starts an asynchronous Modal call", async () => {
    vi.stubEnv("MODAL_LATENTSYNC_URL", "https://latent.example.com/");
    vi.stubEnv("MODAL_WEBHOOK_SECRET", "secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ call_id: "fc-123", status: "processing" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(latentSyncModalPodcastLipsyncProvider.createClip({
      videoUrl: "https://cdn.example.com/base.mp4",
      audioUrl: "https://cdn.example.com/audio.mp3",
      mode: "precision",
    })).resolves.toEqual({ providerTaskId: "fc-123" });
    expect(fetchMock).toHaveBeenCalledWith("https://latent.example.com/start", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-webhook-secret": "secret" }),
    }));
  });

  it("maps Modal pending and completed responses to the neutral task contract", async () => {
    vi.stubEnv("MODAL_LATENTSYNC_URL", "https://latent.example.com");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 202 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ status: "completed", output_url: "https://r2.example.com/out.mp4" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(latentSyncModalPodcastLipsyncProvider.pollClip("fc-123")).resolves.toEqual({ status: "processing" });
    await expect(latentSyncModalPodcastLipsyncProvider.pollClip("fc-123")).resolves.toEqual({
      status: "completed",
      videoUrl: "https://r2.example.com/out.mp4",
    });
  });
});
