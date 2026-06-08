import { describe, expect, it } from "vitest";
import { buildDuplicateJobPayload, isUnsupportedAvatarDuplicate } from "@/lib/job-duplicate-payload";

describe("job duplicate payload helper", () => {
  it("copies modern video job settings into the create-job body shape", () => {
    const result = buildDuplicateJobPayload({
      prompt: "  Launch film  ",
      target_duration_seconds: 12,
      engine_used: "seedance2_byteplus",
      image_url: "https://cdn.example.com/input.jpg",
      references_payload: { images: [{ role: "outfit_style", url: "https://signed.example.com/ref.jpg" }] },
      byteplus_asset_ids: [" asset-1 ", "", "asset-2"],
      multi_scene_chain: false,
      chain_strategy: "anchor",
      audio_mode: "custom",
      audio_prompt: "city rain",
      voiceover_text: "A calm narration.",
      aspect_ratio: "9:16",
      caption_mode: "custom",
      caption_style: "bold yellow captions",
      storyboard: [
        { prompt: " Scene one ", duration_sec: 4, engine: "seedance2_byteplus" },
        { prompt: "Scene two", duration_sec: 5, engine: "auto" },
      ],
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        prompt: "Launch film",
        target_duration_seconds: 12,
        preferred_engine: "seedance2_byteplus",
        image_url: "https://cdn.example.com/input.jpg",
        references: { images: [{ role: "outfit_style", url: "https://signed.example.com/ref.jpg" }] },
        scenes: [
          { prompt: "Scene one", duration_sec: 4, engine: "seedance2_byteplus" },
          { prompt: "Scene two", duration_sec: 5 },
        ],
        byteplus_asset_ids: ["asset-1", "asset-2"],
        multi_scene_chain: false,
        chain_strategy: "anchor",
        audio_mode: "custom",
        audio_prompt: "city rain",
        voiceover_text: "A calm narration.",
        aspect_ratio: "9:16",
        caption_mode: "custom",
        caption_style: "bold yellow captions",
      },
    });
  });

  it("omits invalid optional fields instead of forwarding stale data", () => {
    const result = buildDuplicateJobPayload({
      prompt: "A clean prompt",
      target_duration_seconds: Number.NaN,
      references_payload: { unknown: true },
      storyboard: [
        { prompt: "", duration_sec: 5, engine: "seedance2_byteplus" },
        { prompt: "Valid scene", duration_sec: "5", engine: "" },
      ],
      byteplus_asset_ids: ["", null],
      chain_strategy: "random",
      audio_mode: "loud",
      aspect_ratio: "4:5",
      caption_mode: "karaoke",
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        prompt: "A clean prompt",
        scenes: [{ prompt: "Valid scene" }],
      },
    });
  });

  it("does not forward plan or execution outputs", () => {
    const result = buildDuplicateJobPayload({
      prompt: "Duplicate me",
      plan: "premium",
      video_url: "https://cdn.example.com/output.mp4",
      status: "done",
      estimated_cost_usd: "1.23",
    } as never);

    expect(result).toEqual({ ok: true, payload: { prompt: "Duplicate me" } });
  });

  it("blocks avatar jobs with a provider-neutral message", () => {
    const result = buildDuplicateJobPayload({
      prompt: "Avatar script",
      engine_used: "heygen_avatar_shots",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Duplicate is not available for avatar jobs yet. Use this job as a reference instead.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toMatch(/heygen|byteplus|atlas|evolink|bailian|kie\.ai/i);
    }
  });

  it("also blocks jobs with avatar post-processing config", () => {
    expect(isUnsupportedAvatarDuplicate({ avatar_final: { mode: "voice-post" } })).toBe(true);
  });

  it("returns a controlled error when the source prompt is missing", () => {
    expect(buildDuplicateJobPayload({ prompt: "   " })).toEqual({
      ok: false,
      status: 400,
      error: "Original job prompt is missing.",
    });
  });
});
