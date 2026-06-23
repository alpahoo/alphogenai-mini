import { describe, it, expect } from "vitest";
import {
  PODCAST_VOICES,
  DEFAULT_HOST_VOICE,
  DEFAULT_GUEST_VOICE,
  isPodcastVoice,
  getPodcastVoice,
} from "../voice-catalog";

describe("podcast voice catalog", () => {
  it("has unique voice ids", () => {
    const ids = PODCAST_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every voice has complete metadata + a known provider", () => {
    for (const v of PODCAST_VOICES) {
      expect(v.id).toBeTruthy();
      expect(v.label).toBeTruthy();
      expect(["elevenlabs", "openai"]).toContain(v.provider);
      expect(["female", "male", "neutral"]).toContain(v.gender);
      expect(v.tone).toBeTruthy();
      expect(v.language).toBeTruthy();
      expect(v.useCase).toBeTruthy();
    }
  });

  it("default host/guest voices exist and are distinct", () => {
    expect(isPodcastVoice(DEFAULT_HOST_VOICE)).toBe(true);
    expect(isPodcastVoice(DEFAULT_GUEST_VOICE)).toBe(true);
    expect(DEFAULT_HOST_VOICE).not.toBe(DEFAULT_GUEST_VOICE);
  });

  it("isPodcastVoice rejects unknown / non-string", () => {
    expect(isPodcastVoice("not-a-voice")).toBe(false);
    expect(isPodcastVoice(123)).toBe(false);
    expect(isPodcastVoice(undefined)).toBe(false);
  });

  it("getPodcastVoice returns metadata or undefined", () => {
    expect(getPodcastVoice(DEFAULT_HOST_VOICE)?.id).toBe(DEFAULT_HOST_VOICE);
    expect(getPodcastVoice("nope")).toBeUndefined();
  });
});
