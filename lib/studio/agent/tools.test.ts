import { describe, expect, it } from "vitest";
import { findModel } from "../catalog";
import { defaultValues, type StudioManifest } from "../manifest";
import type { StudioContext } from "./patch";
import { runTool, TOOL_NAMES, toolDefinitions } from "./tools";

const ctxFor = (slug: string): StudioContext => {
  const model = findModel(slug)!; const manifest = model.manifest as StudioManifest;
  return { model, manifest, values: { ...defaultValues(manifest), prompt: "A cinematic scene" }, hasReference: false };
};

describe("assistant tools derived from manifests", () => {
  for (const slug of ["minimax-h3", "moss-image"]) {
    const ctx = ctxFor(slug);
    it(`${slug}: exactly three tools, none can generate, submit, dispatch or touch a graph`, () => {
      const defs = toolDefinitions(ctx);
      expect(defs.map(d => d.name)).toEqual(["get_config", "describe_param", "propose_patch"]);
      expect(TOOL_NAMES).toEqual(defs.map(d => d.name));
      for (const d of defs) expect(d.name).not.toMatch(/generat|submit|dispatch|run|graph|node|file|secret/i);
    });

    it(`${slug}: propose_patch schema lists exactly the manifest parameters, closed to other keys`, () => {
      const patch = toolDefinitions(ctx).find(d => d.name === "propose_patch")!.input_schema as {
        additionalProperties: boolean; properties: { changes: { additionalProperties: boolean; properties: Record<string, Record<string, unknown>> } };
      };
      expect(patch.additionalProperties).toBe(false);
      expect(patch.properties.changes.additionalProperties).toBe(false);
      const props = patch.properties.changes.properties;
      expect(Object.keys(props)).toEqual(ctx.manifest.params.map(p => p.key));
      for (const locked of ctx.manifest.locked ?? []) expect(props).not.toHaveProperty(locked);
      for (const p of ctx.manifest.params) {
        if (p.widget === "select") expect(props[p.key].enum).toEqual(p.options);
        if (p.widget === "number") expect([props[p.key].minimum, props[p.key].maximum]).toEqual([p.min, p.max]);
      }
    });
  }

  it("get_config reports settings, workflow and output without exposing graph nodes", () => {
    const r = runTool(ctxFor("moss-image"), "get_config", {});
    expect(r.ok).toBe(true);
    if (!r.ok || r.tool !== "get_config") return;
    expect(r.config).toMatchObject({ template: "moss-image@1", workflow: "t2i", reference_attached: false });
    expect(r.config.output).toContain("1024 × 1024");
    const json = JSON.stringify(r.config);
    expect(json).not.toMatch(/class_type|"inputs"|\.safetensors|KSampler|UNETLoader/);
  });

  it("describe_param returns the manifest rules, refuses unknown and locked keys", () => {
    const r = runTool(ctxFor("moss-image"), "describe_param", { key: "steps" });
    expect(r.ok && r.tool === "describe_param" && r.param).toMatchObject({ key: "steps", min: 10, max: 50, default: 25 });
    expect(runTool(ctxFor("moss-image"), "describe_param", { key: "unet_name" }).ok).toBe(false);
    expect(runTool(ctxFor("moss-image"), "describe_param", { key: "steps", extra: 1 }).ok).toBe(false);
  });

  it("propose_patch goes through the strict validator", () => {
    const ok = runTool(ctxFor("moss-image"), "propose_patch", { changes: { steps: 30 }, rationale: "More detail" });
    expect(ok.ok && ok.tool === "propose_patch" && ok.proposal.changes.map(c => c.key)).toEqual(["steps"]);
    const bad = runTool(ctxFor("moss-image"), "propose_patch", { changes: { unet_name: "x" } });
    expect(bad).toMatchObject({ ok: false, errors: [{ code: "locked_param" }] });
    expect(runTool(ctxFor("moss-image"), "propose_patch", { changes: { steps: 30 }, generate: true })).toMatchObject({ ok: false, errors: [{ code: "bad_input" }] });
    expect(runTool(ctxFor("moss-image"), "propose_patch", { changes: { steps: 30 }, rationale: 7 })).toMatchObject({ ok: false });
  });

  it("refuses unknown tools and malformed inputs", () => {
    for (const name of ["generate", "submit_run", "run_graph", "read_file", "exec", "", null, 1]) {
      expect(runTool(ctxFor("moss-image"), name, {})).toMatchObject({ ok: false, errors: [{ code: "unknown_tool" }] });
    }
    for (const input of [null, "x", [], 3]) expect(runTool(ctxFor("moss-image"), "get_config", input).ok).toBe(false);
    expect(runTool(ctxFor("moss-image"), "get_config", { anything: 1 }).ok).toBe(false);
  });
});
