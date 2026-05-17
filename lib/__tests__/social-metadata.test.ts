import { describe, it, expect } from "vitest";
import { generateSocialMetadata } from "../social-metadata";
import type { SocialMetadata } from "../social-metadata";

// ---------------------------------------------------------------------------
// These tests exercise the template fallback path, which runs when
// EVOLINK_API_KEY is NOT set (the default in test environment).
// No mocks needed — the function naturally falls through to templates.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Basic output shape
// ---------------------------------------------------------------------------

describe("generateSocialMetadata — output shape", () => {
  it("returns all required fields", async () => {
    const meta = await generateSocialMetadata("a cat jumping over rooftops");
    expect(meta).toHaveProperty("title");
    expect(meta).toHaveProperty("hashtags");
    expect(meta).toHaveProperty("description_tiktok");
    expect(meta).toHaveProperty("description_youtube");
    expect(meta).toHaveProperty("description_instagram");
  });

  it("title is a non-empty string", async () => {
    const meta = await generateSocialMetadata("sunset over the ocean");
    expect(typeof meta.title).toBe("string");
    expect(meta.title.length).toBeGreaterThan(0);
  });

  it("title is max 70 characters", async () => {
    const meta = await generateSocialMetadata(
      "a very long prompt about an incredibly detailed scene with many many many words describing everything in extreme detail"
    );
    expect(meta.title.length).toBeLessThanOrEqual(70);
  });

  it("hashtags is an array of strings", async () => {
    const meta = await generateSocialMetadata("test video");
    expect(Array.isArray(meta.hashtags)).toBe(true);
    for (const tag of meta.hashtags) {
      expect(typeof tag).toBe("string");
      expect(tag.startsWith("#")).toBe(true);
    }
  });

  it("hashtags includes base tags", async () => {
    const meta = await generateSocialMetadata("random prompt");
    expect(meta.hashtags).toContain("#aivideo");
    expect(meta.hashtags).toContain("#alphogenai");
  });

  it("hashtags are unique (no duplicates)", async () => {
    const meta = await generateSocialMetadata("cinematic nature scene");
    const unique = new Set(meta.hashtags);
    expect(unique.size).toBe(meta.hashtags.length);
  });

  it("hashtags max 12", async () => {
    const meta = await generateSocialMetadata(
      "cinematic nature space astronaut food cooking tech fashion"
    );
    expect(meta.hashtags.length).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// 2. Keyword matching
// ---------------------------------------------------------------------------

describe("generateSocialMetadata — keyword matching", () => {
  it("adds #cinematic for cinematic prompts", async () => {
    const meta = await generateSocialMetadata("cinematic wide shot of a city");
    expect(meta.hashtags).toContain("#cinematic");
  });

  it("adds #nature for nature prompts", async () => {
    const meta = await generateSocialMetadata("sunset over the ocean waves");
    expect(meta.hashtags).toContain("#nature");
  });

  it("adds #scifi for sci-fi prompts", async () => {
    const meta = await generateSocialMetadata("astronaut walking on mars");
    expect(meta.hashtags).toContain("#scifi");
  });

  it("adds #cute for animal prompts", async () => {
    const meta = await generateSocialMetadata("a cute puppy running in a field");
    expect(meta.hashtags).toContain("#cute");
  });

  it("adds #foodie for food prompts", async () => {
    const meta = await generateSocialMetadata("chef cooking in a restaurant kitchen");
    expect(meta.hashtags).toContain("#foodie");
  });

  it("always includes #viral", async () => {
    const meta = await generateSocialMetadata("completely random test");
    expect(meta.hashtags).toContain("#viral");
  });
});

// ---------------------------------------------------------------------------
// 3. Platform-specific descriptions
// ---------------------------------------------------------------------------

describe("generateSocialMetadata — platform descriptions", () => {
  it("TikTok description is short and punchy", async () => {
    const meta = await generateSocialMetadata("epic dragon flying over mountains");
    expect(meta.description_tiktok.length).toBeLessThan(300);
    expect(meta.description_tiktok).toContain("AI");
  });

  it("YouTube description mentions AI-generated", async () => {
    const meta = await generateSocialMetadata("test video");
    expect(meta.description_youtube.toLowerCase()).toContain("ai");
  });

  it("YouTube description mentions alphogenai or alphogen", async () => {
    const meta = await generateSocialMetadata("test video");
    expect(meta.description_youtube.toLowerCase()).toContain("alphogen");
  });

  it("Instagram description includes hashtags", async () => {
    const meta = await generateSocialMetadata("beautiful flower field");
    expect(meta.description_instagram).toContain("#");
  });

  it("engine name appears in YouTube description when provided", async () => {
    const meta = await generateSocialMetadata("test video", "Seedance 2.0");
    expect(meta.description_youtube).toContain("Seedance 2.0");
  });
});

// ---------------------------------------------------------------------------
// 4. Scene marker stripping
// ---------------------------------------------------------------------------

describe("generateSocialMetadata — scene marker stripping", () => {
  it("strips [Scene X/Y] markers from prompt", async () => {
    const meta = await generateSocialMetadata("[Scene 1/3] a cat jumping [Scene 2/3] over rooftops");
    expect(meta.title).not.toContain("[Scene");
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases
// ---------------------------------------------------------------------------

describe("generateSocialMetadata — edge cases", () => {
  it("handles very short prompt", async () => {
    const meta = await generateSocialMetadata("hi");
    expect(meta.title.length).toBeGreaterThan(0);
    expect(meta.hashtags.length).toBeGreaterThan(0);
  });

  it("handles empty prompt", async () => {
    const meta = await generateSocialMetadata("");
    expect(meta.title).toBeDefined();
    expect(meta.hashtags.length).toBeGreaterThan(0);
  });

  it("all descriptions are non-empty strings", async () => {
    const meta = await generateSocialMetadata("a beautiful sunset");
    expect(meta.description_tiktok.length).toBeGreaterThan(0);
    expect(meta.description_youtube.length).toBeGreaterThan(0);
    expect(meta.description_instagram.length).toBeGreaterThan(0);
  });
});
