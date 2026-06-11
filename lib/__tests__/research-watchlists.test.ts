import { describe, expect, it } from "vitest";
import {
  normalizeChangedetectionWebhook,
  normalizeWatchlistWrite,
  topicFromWatchlistEvent,
} from "@/lib/research/watchlists";

describe("research watchlists", () => {
  it("normalizes a valid watchlist write", () => {
    const result = normalizeWatchlistWrite({
      name: " AI model releases ",
      topic: "Track major AI video model releases",
      url: "https://example.com/releases",
      mode: "news",
      status: "active",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("AI model releases");
      expect(result.value.mode).toBe("news");
    }
  });

  it("rejects invalid watchlist URLs and modes", () => {
    expect(normalizeWatchlistWrite({
      name: "x",
      topic: "ok topic",
      url: "ftp://example.com",
      mode: "unknown",
    }).ok).toBe(false);
  });

  it("normalizes changedetection webhook events", () => {
    const result = normalizeChangedetectionWebhook({
      watchlist_id: "watch-1",
      url: "https://example.com/blog/new-model",
      title: "New model released",
      summary: "A new release landed.",
      change_url: "https://example.com/diff",
      detected_at: "2026-06-11T01:02:03Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("New model released");
      expect(result.value.detectedAt).toBe("2026-06-11T01:02:03.000Z");
    }
  });

  it("builds bounded draft research topics", () => {
    const title = "x".repeat(600);
    expect(topicFromWatchlistEvent("Base topic", title)).toHaveLength(500);
    expect(topicFromWatchlistEvent("Base topic", null)).toBe("Base topic");
  });
});
