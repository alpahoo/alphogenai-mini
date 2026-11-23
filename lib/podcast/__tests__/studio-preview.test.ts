import { describe, expect, it } from "vitest";
import {
  buildPodcastStudioPreviewPrompt,
  getPodcastStudioStyle,
  PODCAST_STUDIO_STYLES,
} from "../studio-preview";

describe("podcast studio preview", () => {
  it("exposes three user-facing studio choices", () => {
    expect(PODCAST_STUDIO_STYLES.map((style) => style.id)).toEqual(["modern", "warm", "newsroom"]);
  });

  it("falls back to the modern studio for an unknown value", () => {
    expect(getPodcastStudioStyle("unknown").id).toBe("modern");
  });

  it("builds a shared-scene prompt with identity and composition constraints", () => {
    const prompt = buildPodcastStudioPreviewPrompt("warm");
    expect(prompt).toContain("Image 1 is the HOST identity and Image 2 is the GUEST identity");
    expect(prompt).toContain("same desk");
    expect(prompt).toContain("no split screen");
    expect(prompt).toContain("warm editorial podcast lounge");
  });
});
