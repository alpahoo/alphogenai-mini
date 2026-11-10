import { describe, expect, it } from "vitest";
import { findModel } from "./catalog";
import { defaultValues, type StudioManifest } from "./manifest";
import { generationPreview } from "./preview";

const moss = findModel("moss-image")!;
const mm = moss.manifest as StudioManifest;
const h3 = findModel("minimax-h3")!;
const hm = h3.manifest as StudioManifest;

describe("generationPreview", () => {
  it("MOSS defaults: t2i workflow, 1024 x 1024 output, no changes, random seed shown", () => {
    const p = generationPreview(moss, mm, { ...defaultValues(mm), prompt: "A mug on a table" }, null);
    expect(p.variant).toBe("t2i");
    expect(p.output).toBe("1024 × 1024 px · 1:1");
    expect(p.changed).toEqual([]);
    expect(p.valid).toBe(true);
    expect(p.rows.find(r => r.key === "seed")?.value).toBe("Random (chosen by the server)");
    expect(p.rows.map(r => r.key)).toEqual(mm.params.map(x => x.key));
  });

  it("lists changes against manifest defaults, numbers compared numerically, prompt never a change", () => {
    const p = generationPreview(moss, mm, { ...defaultValues(mm), prompt: "x y z", steps: 30, cfg: "2.5", aspect: "16:9", seed: 42, negative_prompt: "" }, null);
    expect(p.changed.map(r => r.key).sort()).toEqual(["aspect", "negative_prompt", "seed", "steps"]);
    const steps = p.changed.find(r => r.key === "steps")!;
    expect([steps.defaultValue, steps.value]).toEqual(["25", "30"]);
    expect(p.changed.find(r => r.key === "negative_prompt")?.value).toBe("(empty)");
    expect(p.output?.endsWith("16:9")).toBe(true);
  });

  it("flags invalid values without hiding them", () => {
    const p = generationPreview(moss, mm, { ...defaultValues(mm), prompt: "ok prompt", steps: 99 }, null);
    expect(p.valid).toBe(false);
    expect(p.rows.find(r => r.key === "steps")?.error).toBeTruthy();
  });

  it("H3: duration shown with the server frame count; full + reference has no workflow", () => {
    const base = { ...defaultValues(hm), prompt: "A cinematic scene" };
    const p = generationPreview(h3, hm, base, null);
    expect(p.variant).toBe("t2v");
    expect(p.output).toBe("480 × 832 px · 5 s · 124 frames · 9:16");
    expect(p.locked.length).toBeGreaterThan(0);
    const bad = generationPreview(h3, hm, { ...base, quality: "full" }, { name: "frame.png" });
    expect(bad.variant).toBeNull();
    expect(bad.valid).toBe(false);
    expect(bad.reference).toBe("frame.png");
  });
});
