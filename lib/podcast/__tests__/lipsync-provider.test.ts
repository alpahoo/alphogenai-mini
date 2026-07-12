import { describe, expect, it, vi } from "vitest";
import { createLipsync, getLipsyncTask } from "@/lib/heygen-client";
import { getPodcastLipsyncProvider, heygenPodcastLipsyncProvider, isPodcastLipsyncProviderId } from "../lipsync-provider";

vi.mock("@/lib/heygen-client", () => ({
  createLipsync: vi.fn(),
  getLipsyncTask: vi.fn(),
}));

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
  it("returns HeyGen as the current baseline provider", () => {
    expect(getPodcastLipsyncProvider()).toBe(heygenPodcastLipsyncProvider);
    expect(getPodcastLipsyncProvider("heygen")).toBe(heygenPodcastLipsyncProvider);
  });

  it("validates persisted provider ids before polling cached tasks", () => {
    expect(isPodcastLipsyncProviderId("heygen")).toBe(true);
    expect(isPodcastLipsyncProviderId("runway")).toBe(false);
    expect(isPodcastLipsyncProviderId(null)).toBe(false);
  });
});
