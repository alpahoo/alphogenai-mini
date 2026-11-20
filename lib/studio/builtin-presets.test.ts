import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STUDIO_MODELS } from "./catalog";
import { applyBuiltinPreset, builtinPresetsFor, presetNotice, type PresetId } from "./builtin-presets";
import { defaultValues, resolveVariant, validateValues, type StudioManifest } from "./manifest";
import { acceptProposal, proposePatch, type StudioContext } from "./agent/patch";

const IDS: PresetId[] = ["cinematic", "portrait", "product", "tutorial", "vertical", "landscape", "night", "dynamic"];
const models = STUDIO_MODELS.filter(m => m.manifest && m.availability === "available");

describe("built-in presets", () => {
  it("covers the eight approved categories for every available model", () => {
    for (const m of models) expect(builtinPresetsFor(m.slug).map(p => p.id)).toEqual(IDS);
  });

  for (const m of models) {
    const manifest = m.manifest as StudioManifest;
    describe(m.title, () => {
      for (const preset of builtinPresetsFor(m.slug)) {
        it(`${preset.id}: only declared parameters, only allowed values, valid with its starter prompt`, () => {
          for (const [key, value] of Object.entries(preset.settings)) {
            const p = manifest.params.find(x => x.key === key);
            expect(p, `${key} is not a ${m.slug} parameter`).toBeTruthy();
            expect(key).not.toBe("prompt");
            if (p!.widget === "select") expect(p!.options).toContain(String(value));
            if (p!.widget === "number") { expect(Number(value)).toBeGreaterThanOrEqual(p!.min ?? -Infinity); expect(Number(value)).toBeLessThanOrEqual(p!.max ?? Infinity); }
          }
          const out = applyBuiltinPreset(manifest, defaultValues(manifest), preset, false);
          expect(validateValues(manifest, out.values)).toEqual({});
          expect(resolveVariant(manifest, out.values, false)).not.toBeNull();
          expect(preset.promptStarter.length).toBeLessThanOrEqual(manifest.params.find(p => p.key === "prompt")!.maxLength ?? 2000);
          // Never touches advanced tuning.
          for (const key of ["seed", "audio_shift_s", "negative_prompt", "steps", "cfg", "sampler_name", "scheduler"]) expect(preset.settings).not.toHaveProperty(key);
        });
      }
    });
  }

  it("never promises capabilities the workflow does not have", () => {
    const text = JSON.stringify(models.flatMap(m => builtinPresetsFor(m.slug)));
    expect(text).not.toMatch(/4K|HD|upscal|1080|720p|60 ?fps/i);
  });

  const h3 = STUDIO_MODELS.find(m => m.slug === "minimax-h3")!.manifest as StudioManifest;
  const cinematic = builtinPresetsFor("minimax-h3").find(p => p.id === "cinematic")!;

  it("keeps the administrator's prompt and advanced settings; fills the prompt only when empty", () => {
    const mine = { ...defaultValues(h3), prompt: "My own prompt about a fox", seed: 42, audio_shift_s: 0.2 };
    const out = applyBuiltinPreset(h3, mine, cinematic, false);
    expect(out.values.prompt).toBe("My own prompt about a fox");
    expect(out.values.seed).toBe(42); expect(out.values.audio_shift_s).toBe(0.2);
    expect(out.values).toMatchObject({ aspect: "16:9", seconds: 5, quality: "full" });
    expect(out.promptFilled).toBe(false);
    const empty = applyBuiltinPreset(h3, { ...defaultValues(h3), prompt: "   " }, cinematic, false);
    expect(empty.values.prompt).toBe(cinematic.promptStarter); expect(empty.promptFilled).toBe(true);
  });

  it("skips full quality while a first frame is attached (no validated workflow), keeps the rest", () => {
    const base = { ...defaultValues(h3), prompt: "x y z", quality: "turbo" };
    const out = applyBuiltinPreset(h3, base, cinematic, true);
    expect(out.values.quality).toBe("turbo"); expect(out.skipped).toEqual(["quality"]);
    expect(out.values.aspect).toBe("16:9");
    expect(resolveVariant(h3, out.values, true)).toBe("i2v");
    expect(presetNotice(h3, cinematic, out)).toMatch(/Not applied with a first frame/);
  });

  it("reports what changed and says when the prompt was kept", () => {
    const out = applyBuiltinPreset(h3, { ...defaultValues(h3), prompt: "keep me" }, cinematic, false);
    const msg = presetNotice(h3, cinematic, out);
    expect(msg).toMatch(/Preset “Cinematic” applied/); expect(msg).toMatch(/Your prompt was kept/);
  });

  it("an assistant proposal after a preset changes only what it proposes: the preset's settings and the edits survive", () => {
    const m = STUDIO_MODELS.find(x => x.slug === "minimax-h3")!;
    const afterPreset = applyBuiltinPreset(h3, { ...defaultValues(h3), prompt: "first idea" }, cinematic, false).values;
    const edited = { ...afterPreset, seconds: 7, seed: 99 }; // manual edits after the preset
    const ctx: StudioContext = { model: m, manifest: h3, values: edited, hasReference: false, referenceId: null, referenceName: null };
    const proposed = proposePatch(ctx, { prompt: "a refined English prompt" }, { rationale: "Better structure" });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const accepted = acceptProposal(ctx, proposed.proposal);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.values).toMatchObject({ prompt: "a refined English prompt", seconds: 7, seed: 99, aspect: "16:9", quality: "full" });
  });

  it("applying a preset is a form change only: no network call, no generation", () => {
    const src = readFileSync("components/studio/use-studio.ts", "utf8");
    const block = src.slice(src.indexOf("const applyPreset"), src.indexOf("// C2a assistant"));
    expect(block).toMatch(/applyBuiltinPreset/);
    expect(block).not.toMatch(/fetch\(|generate\(|dispatch|retryDispatch|idempotency/);
    const lib = readFileSync("lib/studio/builtin-presets.ts", "utf8");
    expect(lib).not.toMatch(/fetch\(|localStorage|process\.env|supabase/i);
  });

  it("presets are shown in the Create panel, not only inside Advanced", () => {
    const panel = readFileSync("components/studio/create-panel.tsx", "utf8");
    expect(panel).toMatch(/<PresetPicker slug=\{model\.slug\} onApply=\{s\.applyPreset\}/);
    const advanced = readFileSync("components/studio/advanced-panel.tsx", "utf8");
    expect(advanced).not.toMatch(/PresetPicker/);
  });
});
