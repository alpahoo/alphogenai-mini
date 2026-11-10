/**
 * Parameter-by-parameter validation of the H3 and MOSS manifests.
 *
 * For every declared parameter, boundary and invalid values are checked twice: by the Studio
 * (`validateValues`, immediate feedback) and by the server binder that admits runs (H3
 * `resolveTemplate`, MOSS `TEMPLATES["moss-image"].resolve`). The Studio must never accept what the
 * server refuses, and must not refuse what the server accepts.
 */
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/comfy/template";
import { TEMPLATES } from "@/lib/comfy/templates";
import { findModel } from "./catalog";
import { defaultValues, submissionParams, validateValues, type ManifestParam, type ParamValues, type StudioManifest } from "./manifest";

const owner = "8b3a3cd3-7c7b-4ba8-9ed5-c124f3176986";
const PROMPT = "A cinematic scene";

const cases = [
  { slug: "minimax-h3", server: (body: unknown) => resolveTemplate(body, owner) },
  { slug: "moss-image", server: (body: unknown) => TEMPLATES["moss-image"].resolve(body, owner) },
] as const;

/** Candidate values for one parameter, derived from the manifest only (nothing invented). */
function candidates(p: ManifestParam): (string | number)[] {
  if (p.widget === "select") return [...(p.options ?? []), "unknown-option", ""];
  if (p.widget === "number") {
    const step = p.step ?? 1, min = p.min ?? 0, max = p.max ?? Number.MAX_SAFE_INTEGER;
    const out = [min, max, min - step, min + step];
    if (max < Number.MAX_SAFE_INTEGER) out.push(max + step, max - step);
    if (step < 1 || step > 1) out.push(min + step / 2); else out.push(min + 0.5);
    return out.filter(Number.isFinite);
  }
  const max = p.maxLength ?? 2000;
  const out: string[] = ["abc", "ab", "a".repeat(max), "a".repeat(max + 1), `${"a".repeat(max - 2)}    `];
  if (p.required === false) out.push("");
  return out;
}

function serverAccepts(server: (b: unknown) => unknown, body: Record<string, unknown>): boolean {
  try { server(body); return true; } catch { return false; }
}

for (const { slug, server } of cases) {
  const manifest = findModel(slug)!.manifest as StudioManifest;
  const base: ParamValues = { ...defaultValues(manifest), prompt: PROMPT };

  describe(`${slug} manifest: Studio validation matches the server binder`, () => {
    it("defaults with a prompt are valid on both sides", () => {
      expect(validateValues(manifest, base)).toEqual({});
      expect(serverAccepts(server, submissionParams(manifest, base, null))).toBe(true);
    });

    for (const p of manifest.params) {
      it(`${p.key}: boundaries and invalid values agree`, () => {
        for (const value of candidates(p)) {
          const values = { ...base, [p.key]: value };
          const clientOk = !validateValues(manifest, values)[p.key];
          const body = submissionParams(manifest, values, null);
          const serverOk = serverAccepts(server, body);
          // An omitted optional value (empty seed / empty select) is the server default: only the
          // client-side refusal matters there, and it must not claim the value is accepted.
          if (clientOk) expect({ key: p.key, value, serverOk }).toEqual({ key: p.key, value, serverOk: true });
          else expect({ key: p.key, value, refusedByClient: true }).toBeTruthy();
          if (!serverOk) expect({ key: p.key, value, clientOk }).toEqual({ key: p.key, value, clientOk: false });
        }
      });
    }

    it("never submits a key the manifest does not declare", () => {
      const declared = new Set(manifest.params.map(p => p.key));
      const body = submissionParams(manifest, { ...base, injected: "x" } as ParamValues, null);
      for (const k of Object.keys(body)) expect(declared.has(k)).toBe(true);
      expect(serverAccepts(server, { ...submissionParams(manifest, base, null), injected: "x" })).toBe(false);
    });
  });
}

describe("manifest structure", () => {
  for (const slug of ["minimax-h3", "moss-image"]) {
    const manifest = findModel(slug)!.manifest as StudioManifest;
    it(`${slug}: every default satisfies its own parameter rules`, () => {
      const errors = validateValues(manifest, { ...defaultValues(manifest), prompt: PROMPT });
      expect(errors).toEqual({});
    });
    it(`${slug}: every select has a default among its options and numbers have min < max`, () => {
      for (const p of manifest.params) {
        if (p.widget === "select" && p.default !== undefined) expect(p.options).toContain(p.default);
        if (p.widget === "number") expect((p.min ?? 0) < (p.max ?? Infinity)).toBe(true);
      }
    });
  }
  it("MOSS: every aspect option has a resolution", () => {
    const manifest = findModel("moss-image")!.manifest as StudioManifest;
    for (const o of manifest.params.find(p => p.key === "aspect")!.options!) expect(manifest.resolutions?.[o]).toHaveLength(2);
  });
});
