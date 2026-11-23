/**
 * "Review before generating": what the Studio is about to submit, derived only from the manifest,
 * the current values and the exported graph of the resolved variant. Display only: the server binder
 * (`lib/comfy/template.ts`, `lib/comfy/bind.ts`) remains the authority on what is accepted.
 */
import { h3Frames, lockedSettings, type LockedSetting, type StudioModel } from "./catalog";
import { defaultValues, resolveVariant, validateValues, type ManifestParam, type ParamValues, type StudioManifest } from "./manifest";

export interface PreviewRow {
  key: string;
  label: string;
  value: string;
  /** Manifest default rendered the same way, or null when the parameter has no default (e.g. seed). */
  defaultValue: string | null;
  changed: boolean;
  tier: string;
  error?: string;
}

export interface GenerationPreview {
  /** Exported graph that will run, or null when the combination has no validated workflow. */
  variant: string | null;
  output: string | null;
  rows: PreviewRow[];
  changed: PreviewRow[];
  locked: LockedSetting[];
  reference: string | null;
  valid: boolean;
}

/** Human-readable value, shared by the review card and the assistant proposals. */
export function display(p: ManifestParam, v: string | number | undefined): string {
  if (v === undefined || v === "") {
    if (p.key === "seed") return "Random (chosen by the server)";
    if (p.widget === "text") return p.required === false ? "(empty)" : "";
    return "";
  }
  if (p.widget === "select") return p.optionLabels?.[String(v)] ? `${p.optionLabels[String(v)]} (${v})` : String(v);
  if (p.widget === "number") return p.unit ? `${v} ${p.unit}` : String(v);
  return String(v);
}

/** Equality as submitted: numbers compared numerically, empty values equal to each other. */
export function same(p: ManifestParam, a: string | number | undefined, b: string | number | undefined): boolean {
  const empty = (x: unknown) => x === undefined || x === "";
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  return p.widget === "number" ? Number(a) === Number(b) : String(a) === String(b);
}

function outputSummary(model: StudioModel, manifest: StudioManifest, values: ParamValues): string | null {
  const aspect = values.aspect !== undefined ? String(values.aspect) : null;
  const size = aspect ? manifest.resolutions?.[aspect] : undefined;
  const parts: string[] = [];
  if (size) parts.push(`${size.join(" × ")} px`);
  if (model.slug === "minimax-h3" && values.seconds !== undefined && values.seconds !== "" && Number.isFinite(Number(values.seconds))) {
    parts.push(`${Number(values.seconds)} s · ${h3Frames(Number(values.seconds))} frames`);
  }
  if (aspect) parts.push(aspect);
  return parts.length ? parts.join(" · ") : null;
}

export function generationPreview(
  model: StudioModel, manifest: StudioManifest, values: ParamValues, reference: { name: string } | null,
): GenerationPreview {
  const defaults = defaultValues(manifest);
  const errors = validateValues(manifest, values);
  const variant = resolveVariant(manifest, values, !!reference);
  const rows: PreviewRow[] = manifest.params.map(p => {
    const v = values[p.key];
    const d = defaults[p.key];
    return {
      key: p.key, label: p.label, value: display(p, v),
      defaultValue: d === undefined ? (p.key === "seed" ? display(p, undefined) : null) : display(p, d),
      // The prompt has no default: it is the request itself, never shown as a "change".
      changed: p.key !== "prompt" && !same(p, v, d),
      tier: p.tier ?? "advanced",
      ...(errors[p.key] ? { error: errors[p.key] } : {}),
    };
  });
  return {
    variant,
    output: outputSummary(model, manifest, values),
    rows,
    changed: rows.filter(r => r.changed),
    locked: lockedSettings(model, variant),
    reference: reference?.name ?? null,
    valid: variant !== null && Object.keys(errors).length === 0,
  };
}

export interface ValueChange { key: string; label: string; from: string; to: string }

/** Parameters whose submitted value differs between two value sets (manifest order). */
export function diffValues(manifest: StudioManifest, before: ParamValues, after: ParamValues): ValueChange[] {
  return manifest.params
    .filter(p => !same(p, before[p.key], after[p.key]))
    .map(p => ({ key: p.key, label: p.label, from: display(p, before[p.key]), to: display(p, after[p.key]) }));
}
