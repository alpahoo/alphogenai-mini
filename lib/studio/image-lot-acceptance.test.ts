import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findModel } from "./catalog";
import { defaultValues, submissionParams, validateValues, type StudioManifest } from "./manifest";
import { fileNameFor, libraryPath, referenceAfterRunDelete } from "./reference-library";

const moss = findModel("moss-image")!;
const manifest = moss.manifest as StudioManifest;
const manifestSource = JSON.parse(readFileSync("workflows/comfy/templates/moss-image/manifest.json", "utf8")) as {
  access: string; outputs: unknown[];
};
const owner = "f5f40f91-89cc-4d94-8adc-d6dd3796306a";
const reference = libraryPath(owner, fileNameFor("Luz", "0a1b2c3d-1111-4222-8333-444455556666", "png"));

describe("Parallax Image lot: MOSS contract", () => {
  it("keeps MOSS admin-only, PNG-preserving and text-to-image", () => {
    expect(moss.availability).toBe("available");
    expect(moss.requiresValidation).toBe(true);
    expect(manifestSource.access).toBe("admin");
    expect(manifest.studio).toMatchObject({ kind: "image", modes: ["text-to-image"] });
    expect(manifestSource.outputs).toEqual([{ node: "9", kind: "image", mime: "image/png" }]);
    expect(manifest.preserve_raw).toBe(true);
  });

  it("accepts manifest bounds and rejects values just outside them", () => {
    const base = { ...defaultValues(manifest), prompt: "A private Luz portrait" };
    expect(validateValues(manifest, base)).toEqual({});
    for (const key of ["steps", "cfg"]) {
      const p = manifest.params.find(x => x.key === key)!;
      const min = p.min!; const max = p.max!; const step = p.step!;
      expect(validateValues(manifest, { ...base, [key]: min })[key]).toBeUndefined();
      expect(validateValues(manifest, { ...base, [key]: max })[key]).toBeUndefined();
      expect(validateValues(manifest, { ...base, [key]: min - step })[key]).toBeDefined();
      expect(validateValues(manifest, { ...base, [key]: max + step })[key]).toBeDefined();
    }
    const body = submissionParams(manifest, { ...base, injected: "must not reach the binder" } as never, reference);
    expect(body).not.toHaveProperty("injected");
    expect(body).not.toHaveProperty("first_frame_path");
  });

  it("keeps the private library reference after deleting a generated result", () => {
    const current = { path: reference, name: "Luz", previewUrl: "https://signed/library" };
    expect(referenceAfterRunDelete(current, "private/runs/result.png")).toBe(current);
    expect(referenceAfterRunDelete(current, reference)).toBe(current);
  });

  it("does not regress owner/admin checks or mobile navigation wiring", () => {
    const media = readFileSync("app/api/admin/comfy/media/[id]/route.ts", "utf8");
    const runs = readFileSync("app/api/admin/comfy/runs/route.ts", "utf8");
    const studio = readFileSync("components/studio/studio.tsx", "utf8");
    expect(media).toContain("owner_id");
    expect(media).toContain("createSignedUrl");
    expect(runs).toContain("requireAdmin");
    expect(runs).toContain("p_user:auth.user.id");
    expect(studio).toContain('aria-label="Studio sections"');
    expect(studio).toContain('"create", "Create"');
    expect(studio).toContain('"result", "Result"');
    expect(studio).toContain('"history", "History"');
  });
});

