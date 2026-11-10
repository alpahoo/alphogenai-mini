import { describe, expect, it } from "vitest";
import { findModel } from "../catalog";
import { defaultValues, type ParamValues, type StudioManifest } from "../manifest";
import * as patchModule from "./patch";
import { acceptProposal, fingerprint, proposePatch, type StudioContext } from "./patch";

const moss = findModel("moss-image")!;
const mm = moss.manifest as StudioManifest;
const h3 = findModel("minimax-h3")!;
const hm = h3.manifest as StudioManifest;

const mossCtx = (values: ParamValues = { ...defaultValues(mm), prompt: "A mug on a table" }): StudioContext =>
  ({ model: moss, manifest: mm, values, hasReference: false });
const h3Ctx = (hasReference = false, values: ParamValues = { ...defaultValues(hm), prompt: "A cinematic scene" }): StudioContext =>
  ({ model: h3, manifest: hm, values, hasReference, referenceName: hasReference ? "frame.png" : null });

const codes = (r: ReturnType<typeof proposePatch>) => (r.ok ? [] : r.errors.map(e => `${e.code}${e.key ? `:${e.key}` : ""}`));

describe("proposePatch: only declared parameters", () => {
  it("refuses unknown parameters, including prototype and graph-looking keys", () => {
    for (const key of ["foo", "graph", "nodes", "1", "7", "class_type", "inputs", "__proto__", "constructor", "prototype", "unet_name_override"]) {
      const raw = JSON.parse(`{${JSON.stringify(key)}: 1}`);
      expect(codes(proposePatch(mossCtx(), raw))).toEqual([`unknown_param:${key}`]);
    }
  });

  it("refuses locked graph inputs with a specific code", () => {
    for (const key of ["unet_name", "clip_name", "vae_name", "denoise", "batch_size"]) {
      expect(codes(proposePatch(mossCtx(), { [key]: "x" }))).toEqual([`locked_param:${key}`]);
    }
    // H3 locks its sampling: "steps" is a MOSS parameter but a locked input for H3.
    for (const key of ["steps", "sampler_name", "scheduler", "lora_strength", "text_encoder"]) {
      expect(codes(proposePatch(h3Ctx(), { [key]: 8 }))).toEqual([`locked_param:${key}`]);
    }
  });

  it("never lets the assistant set the private reference image", () => {
    expect(codes(proposePatch(h3Ctx(), { first_frame_path: "someone/else.png" }))).toEqual(["reference_param:first_frame_path"]);
  });

  it("one forbidden key rejects the whole patch (no partial application)", () => {
    const r = proposePatch(mossCtx(), { steps: 30, unet_name: "other.safetensors" });
    expect(codes(r)).toEqual(["locked_param:unet_name"]);
  });
});

describe("proposePatch: types, bounds, options, combinations", () => {
  it("rejects non-object patches", () => {
    for (const raw of [null, undefined, 42, "steps=30", [], [["steps", 30]], new Date(), new Map([["steps", 30]])]) {
      expect(codes(proposePatch(mossCtx(), raw))).toEqual(["not_object"]);
    }
    expect(codes(proposePatch(mossCtx(), {}))).toEqual(["empty"]);
  });

  it("checks types strictly (no string-to-number coercion)", () => {
    expect(codes(proposePatch(mossCtx(), { steps: "30" }))).toEqual(["wrong_type:steps"]);
    expect(codes(proposePatch(mossCtx(), { steps: Number.NaN }))).toEqual(["wrong_type:steps"]);
    expect(codes(proposePatch(mossCtx(), { cfg: Number.POSITIVE_INFINITY }))).toEqual(["wrong_type:cfg"]);
    expect(codes(proposePatch(mossCtx(), { aspect: 1 }))).toEqual(["wrong_type:aspect"]);
    expect(codes(proposePatch(mossCtx(), { prompt: 5 }))).toEqual(["wrong_type:prompt"]);
    expect(codes(proposePatch(mossCtx(), { steps: true } as never))).toEqual(["wrong_type:steps"]);
    expect(codes(proposePatch(mossCtx(), { steps: { value: 30 } } as never))).toEqual(["wrong_type:steps"]);
  });

  it("checks manifest bounds, steps and options", () => {
    expect(codes(proposePatch(mossCtx(), { steps: 51 }))).toEqual(["invalid_value:steps"]);
    expect(codes(proposePatch(mossCtx(), { steps: 9 }))).toEqual(["invalid_value:steps"]);
    expect(codes(proposePatch(mossCtx(), { steps: 30.5 }))).toEqual(["invalid_value:steps"]);
    expect(codes(proposePatch(mossCtx(), { cfg: 2.55 }))).toEqual(["invalid_value:cfg"]);
    expect(codes(proposePatch(mossCtx(), { aspect: "21:9" }))).toEqual(["invalid_value:aspect"]);
    expect(codes(proposePatch(mossCtx(), { prompt: "ab" }))).toEqual(["invalid_value:prompt"]);
    expect(codes(proposePatch(mossCtx(), { prompt: "a".repeat(2001) }))).toEqual(["invalid_value:prompt"]);
    expect(codes(proposePatch(h3Ctx(), { seconds: 11 }))).toEqual(["invalid_value:seconds"]);
    expect(codes(proposePatch(h3Ctx(), { audio_shift_s: 0.61 }))).toEqual(["invalid_value:audio_shift_s"]);
  });

  it("null only clears a parameter without default (seed → random)", () => {
    const r = proposePatch(mossCtx({ ...defaultValues(mm), prompt: "A mug", seed: 42 }), { seed: null });
    expect(r.ok && r.proposal.after.seed).toBeUndefined();
    expect(r.ok && r.proposal.changes.map(c => c.to)).toEqual(["Random (chosen by the server)"]);
    expect(codes(proposePatch(mossCtx(), { steps: null }))).toEqual(["wrong_type:steps"]);
    expect(codes(proposePatch(mossCtx(), { prompt: null }))).toEqual(["wrong_type:prompt"]);
  });

  it("refuses combinations without a validated workflow (H3 full quality with a reference)", () => {
    expect(codes(proposePatch(h3Ctx(true), { quality: "full" }))).toEqual(["no_workflow"]);
    expect(proposePatch(h3Ctx(false), { quality: "full" }).ok).toBe(true);
  });

  it("refuses no-op patches, oversized patches and long rationales", () => {
    expect(codes(proposePatch(mossCtx(), { steps: 25 }))).toEqual(["no_change"]);
    const tooMany = Object.fromEntries(Array.from({ length: mm.params.length + 1 }, (_, i) => [`k${i}`, 1]));
    expect(codes(proposePatch(mossCtx(), tooMany))).toEqual(["too_many"]);
    expect(codes(proposePatch(mossCtx(), { steps: 30 }, { rationale: "x".repeat(501) }))).toEqual(["rationale_too_long"]);
  });
});

describe("proposePatch: proposal content (C1a preview reused)", () => {
  it("builds before/after, the change list and the full preview without mutating the form", () => {
    const ctx = mossCtx();
    const before = { ...ctx.values };
    const r = proposePatch(ctx, { steps: 30, aspect: "16:9" }, { rationale: " More detail, landscape ", id: "p1", now: new Date("2026-11-10T00:00:00Z") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ctx.values).toEqual(before);
    expect(r.proposal).toMatchObject({ id: "p1", template: "moss-image@1", rationale: "More detail, landscape", createdAt: "2026-11-10T00:00:00.000Z" });
    expect(r.proposal.changes).toEqual([
      { key: "aspect", label: "Format", from: expect.stringContaining("1:1"), to: expect.stringContaining("16:9") },
      { key: "steps", label: "Steps", from: "25", to: "30" },
    ]);
    expect(r.proposal.preview.variant).toBe("t2i");
    expect(r.proposal.preview.output).toContain("16:9");
    expect(r.proposal.after).toMatchObject({ steps: 30, aspect: "16:9", prompt: "A mug on a table" });
  });
});

describe("acceptProposal: returns form values only, never generates", () => {
  it("accepting returns the new values for the form", () => {
    const ctx = mossCtx();
    const r = proposePatch(ctx, { steps: 30 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = acceptProposal(ctx, r.proposal);
    expect(a).toEqual({ ok: true, values: { ...ctx.values, steps: 30 } });
  });

  it("is refused as stale if the user changed the form or the reference meanwhile", () => {
    const ctx = h3Ctx();
    const r = proposePatch(ctx, { seconds: 8 });
    if (!r.ok) throw new Error("expected ok");
    expect(acceptProposal({ ...ctx, values: { ...ctx.values, aspect: "16:9" } }, r.proposal)).toEqual({ ok: false, code: "stale" });
    expect(acceptProposal({ ...ctx, hasReference: true }, r.proposal)).toEqual({ ok: false, code: "stale" });
  });

  it("is refused for another template", () => {
    const r = proposePatch(mossCtx(), { steps: 30 });
    if (!r.ok) throw new Error("expected ok");
    expect(acceptProposal(h3Ctx(), r.proposal)).toEqual({ ok: false, code: "wrong_template" });
  });

  it("re-validates a tampered proposal instead of trusting its stored values", () => {
    const ctx = mossCtx();
    const r = proposePatch(ctx, { steps: 30 });
    if (!r.ok) throw new Error("expected ok");
    const tampered = { ...r.proposal, patch: { steps: 30, unet_name: "x" }, after: { ...r.proposal.after, unet_name: "x" } };
    const a = acceptProposal(ctx, tampered);
    expect(a.ok).toBe(false);
    expect(!a.ok && a.code).toBe("invalid");
  });

  it("the patch module exposes no generation, submission or dispatch entry point", () => {
    const names = Object.keys(patchModule);
    expect(names.filter(n => /generat|submit|dispatch|run|fetch|admit/i.test(n))).toEqual([]);
  });

  it("fingerprint ignores key order", () => {
    expect(fingerprint({ a: 1, b: "x" }, false)).toBe(fingerprint({ b: "x", a: 1 }, false));
    expect(fingerprint({ a: 1 }, false)).not.toBe(fingerprint({ a: 1 }, true));
  });
});
