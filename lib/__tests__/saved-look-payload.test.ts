import { describe, expect, it } from "vitest";
import { buildSavedLookReusePayload } from "@/lib/saved-look-payload";

describe("saved look payload helper", () => {
  it("builds the create-job body for reusing a saved cinematic look", () => {
    expect(
      buildSavedLookReusePayload({
        lookId: " look_123 ",
        scriptText: "  New launch script  ",
        voiceId: " voice_456 ",
        lipsyncMode: "precision",
      }),
    ).toEqual({
      ok: true,
      payload: {
        prompt: "New launch script",
        preferred_engine: "heygen_avatar_shots",
        look_id: "look_123",
        voice_id: "voice_456",
        script_text: "New launch script",
        lipsync_mode: "precision",
        audio_mode: "none",
      },
    });
  });

  it("defaults lipsync quality to speed and never exposes provider names", () => {
    const result = buildSavedLookReusePayload({
      lookId: "look_123",
      scriptText: "Speak naturally",
      voiceId: "voice_456",
      lipsyncMode: "unknown",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.lipsync_mode).toBe("speed");
      expect(JSON.stringify(result.payload)).not.toMatch(/byteplus|atlas|evolink|bailian|kie\.ai/i);
    }
  });

  it("returns user-facing validation errors for missing required inputs", () => {
    expect(buildSavedLookReusePayload({ scriptText: "hello", voiceId: "voice_1" })).toEqual({
      ok: false,
      error: "Choose a saved Look.",
    });
    expect(buildSavedLookReusePayload({ lookId: "look_1", voiceId: "voice_1" })).toEqual({
      ok: false,
      error: "Write the script for this Look.",
    });
    expect(buildSavedLookReusePayload({ lookId: "look_1", scriptText: "hello" })).toEqual({
      ok: false,
      error: "Pick a voice for this Look.",
    });
  });

  it("caps script text to the backend limit", () => {
    const result = buildSavedLookReusePayload({
      lookId: "look_1",
      scriptText: "x".repeat(2100),
      voiceId: "voice_1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.script_text).toHaveLength(2000);
      expect(result.payload.prompt).toHaveLength(2000);
    }
  });
});

