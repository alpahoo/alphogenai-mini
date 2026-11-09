import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/comfy/template";
import { findModel, h3Frames, lockedSettings, STUDIO_MODELS } from "./catalog";
import { defaultValues, optionSupported, paramsByTier, referenceSupported, resolveVariant, submissionParams, validateValues, valuesFromRun, type StudioManifest } from "./manifest";

const h3 = findModel("minimax-h3")!;
const m = h3.manifest as StudioManifest;
const owner = "8b3a3cd3-7c7b-4ba8-9ed5-c124f3176986";

describe("Studio manifest helpers (H3)", () => {
  it("splits simple and advanced controls from the manifest, prompt rendered separately", () => {
    expect(paramsByTier(m, "simple").map(p => p.key)).toEqual(["seconds", "aspect", "quality"]);
    expect(paramsByTier(m, "advanced").map(p => p.key)).toEqual(["seed", "audio_shift_s"]);
  });

  it("keeps the audio advance default at 0.4 s and no default seed", () => {
    const d = defaultValues(m);
    expect(d.audio_shift_s).toBe(0.4);
    expect(d.seed).toBeUndefined();
  });

  it.each([[false, "turbo", "t2v"], [false, "full", "t2v_full"], [true, "turbo", "i2v"], [true, "full", null]])(
    "mirrors the manifest variant table: image=%s quality=%s", (image, quality, variant) => {
      expect(resolveVariant(m, { ...defaultValues(m), quality }, image)).toBe(variant);
    });

  it("disables Full quality once a first frame is attached, never invents a combination", () => {
    const v = defaultValues(m);
    expect(optionSupported(m, v, true, "quality", "full")).toBe(false);
    expect(optionSupported(m, v, true, "quality", "turbo")).toBe(true);
    expect(optionSupported(m, v, false, "quality", "full")).toBe(true);
    expect(referenceSupported(m, { ...v, quality: "full" })).toBe(false);
    expect(referenceSupported(m, { ...v, quality: "turbo" })).toBe(true);
  });

  it("validates like the server for common mistakes", () => {
    const v = { ...defaultValues(m), prompt: "ab" };
    expect(validateValues(m, v).prompt).toBeTruthy();
    expect(validateValues(m, { ...v, prompt: "A good prompt", seconds: 11 }).seconds).toBeTruthy();
    expect(validateValues(m, { ...v, prompt: "A good prompt", audio_shift_s: 0.123 }).audio_shift_s).toBeTruthy();
    expect(validateValues(m, { ...v, prompt: "A good prompt" })).toEqual({});
  });

  it("produces a submission the server binding accepts, for every supported variant", () => {
    for (const [quality, ref] of [["turbo", null], ["full", null], ["turbo", `${owner}/frame.png`]] as const) {
      const body = submissionParams(m, { ...defaultValues(m), prompt: "A cinematic scene", quality }, ref);
      expect(Object.keys(body)).not.toContain("seed");
      expect(() => resolveTemplate(body, owner)).not.toThrow();
    }
  });

  it("restores run params, drops unknown keys, and can reroll the seed", () => {
    const run = { prompt: "Hello", seconds: 7, aspect: "16:9", quality: "turbo", seed: 42, audio_shift_s: 0.35, steps: 99 };
    expect(valuesFromRun(m, run, true)).toEqual({ prompt: "Hello", seconds: 7, aspect: "16:9", quality: "turbo", seed: 42, audio_shift_s: 0.35 });
    expect(valuesFromRun(m, run, false).seed).toBeUndefined();
  });

  it("shows locked values read from the exported graph of the chosen variant", () => {
    const turbo = Object.fromEntries(lockedSettings(h3, "t2v").map(l => [l.label, l.value]));
    expect(turbo).toMatchObject({ Sampler: "euler", Scheduler: "beta", Steps: "8", "Turbo LoRA strength": "1" });
    const full = Object.fromEntries(lockedSettings(h3, "t2v_full").map(l => [l.label, l.value]));
    expect(full).toMatchObject({ Sampler: "res_multistep", Steps: "20" });
    expect(full["Turbo LoRA strength"]).toBeUndefined();
    expect(lockedSettings(h3, null)).toEqual([]);
  });

  it("computes the same frame count as the server", () => {
    expect(h3Frames(5)).toBe(124);
    expect(h3Frames(7)).toBe(175);
  });

  it("MOSS is wired but always behind its licence and GPU gate", () => {
    const moss = STUDIO_MODELS.find(x => x.slug === "moss-image")!;
    expect(moss.availability).toBe("available");
    expect(moss.requiresValidation).toBe(true);
    expect(moss.reservationUsd).toBe(0.2);
  });
});

describe("Studio manifest helpers (MOSS)", () => {
  const moss = findModel("moss-image")!;
  const mm = moss.manifest as StudioManifest;
  it("single-graph template resolves to t2i without variant axes", () => {
    expect(resolveVariant(mm, defaultValues(mm), false)).toBe("t2i");
    expect(referenceSupported(mm, defaultValues(mm))).toBe(false);
  });
  it("puts sampling controls in Advanced and allows an empty negative prompt", () => {
    expect(paramsByTier(mm, "simple").map(p => p.key)).toEqual(["aspect"]);
    expect(paramsByTier(mm, "advanced").map(p => p.key)).toEqual(["negative_prompt", "seed", "steps", "cfg", "sampler_name", "scheduler"]);
    expect(validateValues(mm, { ...defaultValues(mm), prompt: "A red bicycle", negative_prompt: "" })).toEqual({});
  });
  it("locks only model files and fixed graph values", () => {
    const locked = Object.fromEntries(lockedSettings(moss, "t2i").map(l => [l.label, l.value]));
    expect(locked).toMatchObject({ "Diffusion model": "moss_image_sft_int8_convrot", VAE: "flux2-vae_small", Denoise: "1", "Batch size": "1" });
    expect(locked.Steps).toBeUndefined();
  });
  it("submission is accepted by the server binder", async () => {
    const { TEMPLATES } = await import("@/lib/comfy/templates");
    const body = submissionParams(mm, { ...defaultValues(mm), prompt: "A lighthouse at dawn", aspect: "9:16" }, null);
    expect(() => TEMPLATES["moss-image"].resolve(body, owner)).not.toThrow();
  });
});
