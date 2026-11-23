/**
 * Parameter-by-parameter validation of the H3 and MOSS manifests.
 *
 * For each declared parameter, candidate values derived from the manifest (never invented) carry an
 * explicit expected verdict. Each candidate is checked twice:
 * - by the Studio (`validateValues`, immediate feedback);
 * - by the server binder that admits runs (H3 `resolveTemplate`, MOSS `TEMPLATES["moss-image"].resolve`).
 * Both verdicts must equal the expected one, so the Studio never accepts what the server refuses,
 * and never refuses what the server accepts.
 *
 * Documented exception: an EMPTY value for a non-text parameter (select or number).
 * `submissionParams` omits it, so the server applies the manifest default (or a random seed) and
 * accepts the body. Where the manifest has a default, the Studio still flags the empty field: the
 * user sees an error instead of a silent default. For these candidates the test asserts that
 * exact pair (Studio refuses, key omitted, server accepts).
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

type Expected = "valid" | "invalid" | "omitted_default";
interface Candidate { value: string | number; expected: Expected; why: string }

/** Candidates with their expected verdict, from the manifest rules only. */
function candidates(p: ManifestParam): Candidate[] {
  if (p.widget === "select") {
    return [
      ...(p.options ?? []).map(o => ({ value: o, expected: "valid" as const, why: "declared option" })),
      { value: "unknown-option", expected: "invalid", why: "undeclared option" },
      { value: "", expected: "omitted_default", why: "empty select is omitted, server applies the default" },
    ];
  }
  if (p.widget === "number") {
    const step = p.step ?? 1, min = p.min ?? 0, max = p.max ?? Number.MAX_SAFE_INTEGER;
    const out: Candidate[] = [
      { value: min, expected: "valid", why: "min" },
      { value: max, expected: "valid", why: "max" },
      { value: min + step, expected: "valid", why: "min + step" },
      { value: min - step, expected: "invalid", why: "below min" },
      { value: min + step / 2, expected: "invalid", why: "off step" },
      { value: "", expected: "omitted_default", why: "empty number is omitted, server applies the default or a random seed" },
    ];
    if (max < Number.MAX_SAFE_INTEGER) {
      out.push({ value: max + step, expected: "invalid", why: "above max" }, { value: max - step, expected: "valid", why: "max - step" });
    }
    return out;
  }
  const max = p.maxLength ?? 2000;
  const optional = p.required === false;
  return [
    { value: "abc", expected: "valid", why: "3 characters" },
    { value: "ab", expected: optional ? "valid" : "invalid", why: optional ? "optional text has no minimum" : "under 3 characters" },
    { value: "a".repeat(max), expected: "valid", why: "exactly max length" },
    { value: "a".repeat(max + 1), expected: "invalid", why: "max + 1" },
    // Raw-length rule: whitespace counts toward the maximum, like the server binders.
    { value: `${"a".repeat(max - 2)}    `, expected: "invalid", why: "padded past max (raw length max + 2)" },
    { value: `  ${"a".repeat(max - 2)}`, expected: "valid", why: "padded to exactly max (raw length max)" },
    { value: "", expected: optional ? "valid" : "invalid", why: optional ? "optional text sent as empty string" : "required prompt missing" },
  ];
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
      it(`${p.key}: every candidate gets the expected verdict from the Studio and the server`, () => {
        const list = candidates(p);
        expect(list.length).toBeGreaterThan(3);
        for (const c of list) {
          const values = { ...base, [p.key]: c.value };
          const studio = !validateValues(manifest, values)[p.key];
          const body = submissionParams(manifest, values, null);
          const serverOk = serverAccepts(server, body);
          const label = { param: p.key, value: typeof c.value === "string" && c.value.length > 20 ? `${c.value.length} chars` : c.value, why: c.why };
          if (c.expected === "omitted_default") {
            // Documented exception: the key is not submitted and the server falls back to its default.
            expect({ ...label, submitted: p.key in body, serverOk }).toEqual({ ...label, submitted: false, serverOk: true });
            // The Studio flags it when the manifest has a default to restore (seed has none: empty = random).
            expect({ ...label, studio }).toEqual({ ...label, studio: p.default === undefined });
          } else {
            const want = c.expected === "valid";
            expect({ ...label, studio, serverOk }).toEqual({ ...label, studio: want, serverOk: want });
          }
        }
      });
    }

    it("never submits a key the manifest does not declare, and the server refuses unknown keys", () => {
      const declared = new Set(manifest.params.map(p => p.key));
      const body = submissionParams(manifest, { ...base, injected: "x" } as ParamValues, null);
      for (const k of Object.keys(body)) expect(declared.has(k)).toBe(true);
      expect(serverAccepts(server, { ...submissionParams(manifest, base, null), injected: "x" })).toBe(false);
    });
  });
}

describe("raw prompt length (Studio = server)", () => {
  for (const { slug, server } of cases) {
    const manifest = findModel(slug)!.manifest as StudioManifest;
    const max = manifest.params.find(p => p.key === "prompt")!.maxLength ?? 2000;
    it(`${slug}: trailing spaces past the limit are refused on both sides; leading spaces up to it are accepted`, () => {
      const base = defaultValues(manifest);
      const over = { ...base, prompt: `${"a".repeat(max - 1)}  ` };
      const exact = { ...base, prompt: ` ${"a".repeat(max - 1)}` };
      expect(validateValues(manifest, over).prompt).toBe(`Maximum ${max} characters`);
      expect(serverAccepts(server, submissionParams(manifest, over, null))).toBe(false);
      expect(validateValues(manifest, exact).prompt).toBeUndefined();
      expect(serverAccepts(server, submissionParams(manifest, exact, null))).toBe(true);
    });
  }
});

describe("manifest structure", () => {
  for (const slug of ["minimax-h3", "moss-image"]) {
    const manifest = findModel(slug)!.manifest as StudioManifest;
    it(`${slug}: every default satisfies its own parameter rules`, () => {
      expect(validateValues(manifest, { ...defaultValues(manifest), prompt: PROMPT })).toEqual({});
    });
    it(`${slug}: select defaults are declared options and number ranges are ordered`, () => {
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
