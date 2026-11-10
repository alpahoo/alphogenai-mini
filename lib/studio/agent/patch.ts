/**
 * C2a: parameter patches for the Studio assistant. No LLM, no network, no generation.
 *
 * A patch is the ONLY thing the assistant can produce: `{ key: value }` over the parameters declared
 * in the template manifest. It is validated strictly (declared keys, types, bounds, options, a
 * combination with an exported workflow), previewed with the C1a review, then accepted or rejected
 * by the user. Accepting only returns the new form values; generation stays the Generate button.
 * Graphs, locked graph inputs, model files and the private reference are out of reach by design.
 */
import type { StudioModel } from "../catalog";
import { resolveVariant, validateValues, type ManifestParam, type ParamValues, type StudioManifest } from "../manifest";
import { diffValues, generationPreview, type GenerationPreview, type ValueChange } from "../preview";

export type PatchValue = string | number | null;
export type RawPatch = Record<string, PatchValue>;

export type PatchErrorCode =
  | "not_object" | "empty" | "too_many" | "unknown_param" | "locked_param" | "reference_param"
  | "wrong_type" | "invalid_value" | "no_workflow" | "no_change" | "rationale_too_long";

export interface PatchError { code: PatchErrorCode; key?: string; message: string }

export interface StudioContext {
  model: StudioModel;
  manifest: StudioManifest;
  values: ParamValues;
  /** Whether a private reference image is attached (it changes the workflow variant). */
  hasReference: boolean;
  referenceName?: string | null;
}

export interface Proposal {
  id: string;
  /** e.g. "moss-image@1": a proposal never crosses templates. */
  template: string;
  /** Fingerprint of the form when proposed: accepting after an edit by the user is refused as stale. */
  base: string;
  patch: RawPatch;
  before: ParamValues;
  after: ParamValues;
  changes: ValueChange[];
  preview: GenerationPreview;
  rationale: string | null;
  createdAt: string;
}

export type ProposeResult = { ok: true; proposal: Proposal } | { ok: false; errors: PatchError[] };
export type AcceptResult = { ok: true; values: ParamValues } | { ok: false; code: "stale" | "wrong_template" | "invalid"; errors?: PatchError[] };

export const MAX_RATIONALE = 500;

export function templateId(manifest: StudioManifest): string {
  return `${manifest.slug}@${manifest.version}`;
}

/** Stable fingerprint of the form (key order independent) plus the reference flag. */
export function fingerprint(values: ParamValues, hasReference: boolean): string {
  const entries = Object.keys(values).sort().map(k => [k, values[k]]);
  return JSON.stringify([entries, hasReference]);
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
}

/** Type and value check of one patched parameter. Returns the value to store, or an error. */
function checkValue(p: ManifestParam, v: unknown): { value: string | number | undefined } | PatchError {
  if (v === null) {
    // Clearing is only meaningful for a number without default (seed): empty = random, chosen by the server.
    if (p.widget === "number" && p.default === undefined) return { value: undefined };
    return { code: "wrong_type", key: p.key, message: `${p.label} cannot be cleared` };
  }
  if (p.widget === "number") {
    if (typeof v !== "number" || !Number.isFinite(v)) return { code: "wrong_type", key: p.key, message: `${p.label} must be a number` };
    return { value: v };
  }
  if (p.widget === "select") {
    if (typeof v !== "string") return { code: "wrong_type", key: p.key, message: `${p.label} must be one of the listed options` };
    if (!p.options?.includes(v)) return { code: "invalid_value", key: p.key, message: `${p.label} must be one of: ${(p.options ?? []).join(", ")}` };
    return { value: v };
  }
  if (p.widget === "text") {
    if (typeof v !== "string") return { code: "wrong_type", key: p.key, message: `${p.label} must be text` };
    return { value: v };
  }
  return { code: "unknown_param", key: p.key, message: `${p.label} cannot be changed` };
}

/** Validate a raw patch against the manifest and the current form, and build a proposal. Pure. */
export function proposePatch(
  ctx: StudioContext, raw: unknown, opts: { rationale?: string | null; id?: string; now?: Date } = {},
): ProposeResult {
  const { manifest } = ctx;
  if (!isPlainObject(raw)) return { ok: false, errors: [{ code: "not_object", message: "A patch is an object of parameter changes" }] };
  const keys = Object.keys(raw);
  if (keys.length === 0) return { ok: false, errors: [{ code: "empty", message: "The patch contains no change" }] };
  if (keys.length > manifest.params.length) return { ok: false, errors: [{ code: "too_many", message: "The patch has more keys than the template has parameters" }] };
  if (opts.rationale && opts.rationale.length > MAX_RATIONALE) {
    return { ok: false, errors: [{ code: "rationale_too_long", message: `Explanation over ${MAX_RATIONALE} characters` }] };
  }

  const params = new Map(manifest.params.map(p => [p.key, p]));
  const locked = new Set(manifest.locked ?? []);
  const referenceParam = manifest.studio?.reference?.param;
  const errors: PatchError[] = [];
  const after: ParamValues = { ...ctx.values };
  const patch: RawPatch = {};

  for (const key of keys) {
    const v = raw[key];
    if (key === referenceParam) { errors.push({ code: "reference_param", key, message: "The reference image is chosen by the user, not by the assistant" }); continue; }
    if (locked.has(key)) { errors.push({ code: "locked_param", key, message: `${key} is fixed by the validated workflow` }); continue; }
    const p = params.get(key);
    if (!p) { errors.push({ code: "unknown_param", key, message: `${key} is not a parameter of ${manifest.title}` }); continue; }
    const checked = checkValue(p, v);
    if ("code" in checked) { errors.push(checked); continue; }
    if (checked.value === undefined) delete after[key]; else after[key] = checked.value;
    patch[key] = v as PatchValue;
  }
  if (errors.length) return { ok: false, errors };

  // Same rules as the Studio form (and, by the C1a parity test, as the server binder).
  const invalid = validateValues(manifest, after);
  for (const key of keys) {
    if (invalid[key]) errors.push({ code: "invalid_value", key, message: `${params.get(key)!.label}: ${invalid[key]}` });
  }
  if (errors.length) return { ok: false, errors };
  if (resolveVariant(manifest, after, ctx.hasReference) === null) {
    return { ok: false, errors: [{ code: "no_workflow", message: "This combination has no validated workflow" }] };
  }

  const changes = diffValues(manifest, ctx.values, after);
  if (changes.length === 0) return { ok: false, errors: [{ code: "no_change", message: "These values are already set" }] };

  return {
    ok: true,
    proposal: {
      id: opts.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p-${Date.now()}`),
      template: templateId(manifest),
      base: fingerprint(ctx.values, ctx.hasReference),
      patch, before: { ...ctx.values }, after, changes,
      preview: generationPreview(ctx.model, manifest, after, ctx.referenceName ? { name: ctx.referenceName } : ctx.hasReference ? { name: "reference" } : null),
      rationale: opts.rationale?.trim() || null,
      createdAt: (opts.now ?? new Date()).toISOString(),
    },
  };
}

/**
 * Accept: re-check the proposal against the CURRENT form and return the values to put in the form.
 * Never submits anything. Refused when the template changed or the user edited the form meanwhile.
 */
export function acceptProposal(ctx: StudioContext, proposal: Proposal): AcceptResult {
  if (proposal.template !== templateId(ctx.manifest)) return { ok: false, code: "wrong_template" };
  if (proposal.base !== fingerprint(ctx.values, ctx.hasReference)) return { ok: false, code: "stale" };
  const again = proposePatch(ctx, proposal.patch, { id: proposal.id, rationale: proposal.rationale });
  if (!again.ok) return { ok: false, code: "invalid", errors: again.errors };
  return { ok: true, values: again.proposal.after };
}
