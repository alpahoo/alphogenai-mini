/**
 * Studio view of a ComfyUI template manifest.
 *
 * Pure helpers shared by the Create screen and tests. They never decide what the
 * server accepts: `lib/comfy/template.ts::resolveTemplate` remains the only
 * authority, and ComfyUI validates the bound graph natively.
 */

export type Widget = "text" | "number" | "select";
export type Tier = "simple" | "advanced";

export interface ManifestParam {
  key: string;
  label: string;
  widget: Widget | string;
  tier?: Tier | string;
  help?: string;
  unit?: string;
  default?: string | number;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  target?: { node: string; input: string };
  derived?: string;
  required?: boolean;
}

export interface StudioReference {
  param: string;
  label: string;
  accept: readonly string[];
  maxBytes: number;
}

export interface StudioManifest {
  slug: string;
  title: string;
  runtime: string;
  version: number;
  variants: Record<string, string | null>;
  params: readonly ManifestParam[];
  resolutions?: Record<string, readonly number[]>;
  locked?: readonly string[];
  preserve_raw?: boolean;
  studio?: {
    kind: "video" | "image" | string;
    modes?: readonly string[];
    reference?: StudioReference;
    variant_axes?: readonly string[];
  };
}

export type ParamValues = Record<string, string | number>;

export function defaultValues(manifest: StudioManifest): ParamValues {
  const values: ParamValues = {};
  for (const p of manifest.params) if (p.default !== undefined) values[p.key] = p.default;
  return values;
}

export function paramsByTier(manifest: StudioManifest, tier: Tier): ManifestParam[] {
  return manifest.params.filter(p => p.key !== "prompt" && (p.tier ?? "advanced") === tier);
}

/** Variant key for the H3-style axes `reference|quality`. Unknown axes → null (fail closed). */
export function variantKey(manifest: StudioManifest, values: ParamValues, hasReference: boolean): string | null {
  const axes = manifest.studio?.variant_axes ?? [];
  if (axes.length === 0) {
    // Single-graph templates: exactly one declared variant, or nothing.
    const keys = Object.keys(manifest.variants).filter(k => manifest.variants[k]);
    return keys.length === 1 ? keys[0] : null;
  }
  const parts = axes.map(axis => axis === "reference" ? (hasReference ? "present" : "absent") : String(values[axis] ?? ""));
  return parts.join("|");
}

/** Variant name, or null when the combination has no exported graph. */
export function resolveVariant(manifest: StudioManifest, values: ParamValues, hasReference: boolean): string | null {
  const key = variantKey(manifest, values, hasReference);
  return key ? manifest.variants[key] ?? null : null;
}

/** Whether a select option keeps the current combination valid. Used to disable, never to hide. */
export function optionSupported(manifest: StudioManifest, values: ParamValues, hasReference: boolean, key: string, option: string): boolean {
  if (!(manifest.studio?.variant_axes ?? []).includes(key)) return true;
  return resolveVariant(manifest, { ...values, [key]: option }, hasReference) !== null;
}

export function referenceSupported(manifest: StudioManifest, values: ParamValues): boolean {
  if (!manifest.studio?.reference) return false;
  return resolveVariant(manifest, values, true) !== null;
}

/**
 * Client-side mirror of the server checks, for immediate feedback only.
 * Returns an error message per invalid key.
 */
export function validateValues(manifest: StudioManifest, values: ParamValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const p of manifest.params) {
    const v = values[p.key];
    if (p.widget === "text") {
      const s = typeof v === "string" ? v.trim() : "";
      const max = p.maxLength ?? 2000;
      if (p.required === false) { if (s.length > max) errors[p.key] = `Maximum ${max} characters`; continue; }
      if (s.length === 0) errors[p.key] = "Write a prompt to generate";
      else if (s.length < 3) errors[p.key] = "Write at least 3 characters";
      else if (s.length > max) errors[p.key] = `Maximum ${max} characters`;
    } else if (p.widget === "number") {
      if (v === undefined || v === "") { if (p.default !== undefined) errors[p.key] = "Required"; continue; }
      const n = Number(v);
      const step = p.step ?? 1;
      const min = p.min ?? -Infinity;
      if (!Number.isFinite(n) || n < min || n > (p.max ?? Infinity)) errors[p.key] = `Between ${p.min} and ${p.max}`;
      else if (Number.isFinite(min) && Math.abs((n - min) / step - Math.round((n - min) / step)) > 1e-5) errors[p.key] = `Steps of ${step}`;
    } else if (p.widget === "select") {
      if (!p.options?.includes(String(v))) errors[p.key] = "Choose an option";
    }
  }
  return errors;
}

/** Body sent to the admission route: only declared keys, empty optional seed omitted. */
export function submissionParams(manifest: StudioManifest, values: ParamValues, referencePath: string | null): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const p of manifest.params) {
    const v = values[p.key];
    // An optional text field cleared on purpose is sent as "" so the server does not restore its default.
    if (v === "" && p.widget === "text" && p.required === false) { out[p.key] = ""; continue; }
    // Empty seed (and any other empty value) is omitted: the server picks a random seed / default.
    if (v === undefined || v === "") continue;
    out[p.key] = p.widget === "number" ? Number(v) : v;
  }
  if (referencePath && manifest.studio?.reference) out[manifest.studio.reference.param] = referencePath;
  return out;
}

/** Restore a run's effective params into editable values, dropping anything the manifest no longer declares. */
export function valuesFromRun(manifest: StudioManifest, effective: Record<string, unknown> | null | undefined, keepSeed: boolean): ParamValues {
  const values = defaultValues(manifest);
  for (const p of manifest.params) {
    const v = effective?.[p.key];
    if (typeof v === "string" || typeof v === "number") values[p.key] = v;
  }
  if (!keepSeed) delete values.seed;
  return values;
}

export function randomSeed(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  // 48-bit like the server-side random seed.
  return (buf[0] % 0x10000) * 0x100000000 + buf[1];
}

export function optionLabel(p: ManifestParam, option: string): string {
  return p.optionLabels?.[option] ?? option;
}
