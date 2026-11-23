/**
 * What the Cinema composer needs to know about a model, derived from the Studio manifest and catalog.
 * The manifest stays the only contract: nothing is assumed that a manifest does not declare.
 *
 * Pure: no network, no storage.
 */
import type { StudioModel } from "@/lib/studio/catalog";
import { referenceReachable, resolveVariant, defaultValues, type ParamValues, type StudioManifest } from "@/lib/studio/manifest";

export interface ModelView {
  slug: string;
  title: string;
  output: "video" | "image";
  manifest: StudioManifest;
  maxPrompt: number;
  aspects: readonly string[];
  defaultAspect: string | null;
  duration: { min: number; max: number; step: number; default: number } | null;
  qualities: readonly string[];
  defaultQuality: string | null;
  /** The reference the manifest declares (H3: one first frame). Null when the model takes none. */
  reference: { param: string; label: string; max: number; accept: readonly string[] } | null;
  /** Video that starts from a reference image (a valid variant exists with a reference). */
  canAnimate: boolean;
  /** Video from text alone (a valid variant exists without a reference). */
  canText: boolean;
  /** Label for the sound note of a shot: models with native audio get the Soundscape wording of the Studio guidance. */
  soundPrefix: "Soundscape" | "Sound";
}

export function modelView(model: StudioModel): ModelView {
  const manifest = model.manifest;
  if (!manifest) throw new Error(`${model.slug} has no manifest`);
  const param = (key: string) => manifest.params.find(p => p.key === key);
  const prompt = param("prompt");
  const aspect = param("aspect");
  const seconds = param("seconds");
  const quality = param("quality");
  const defaults: ParamValues = defaultValues(manifest);
  const output = manifest.studio?.kind === "image" ? "image" : "video";
  const ref = manifest.studio?.reference;
  const qualities = quality?.options ?? [];
  // Try every declared quality: a variant counts if any quality combination has a graph.
  const tryAll = (withReference: boolean) => (qualities.length ? qualities : [""]).some(q =>
    resolveVariant(manifest, { ...defaults, ...(q ? { quality: q } : {}) }, withReference) !== null);
  return {
    slug: model.slug, title: model.title, output, manifest,
    maxPrompt: prompt?.maxLength ?? 2000,
    aspects: aspect?.options ?? [],
    defaultAspect: aspect?.default !== undefined ? String(aspect.default) : null,
    duration: seconds && seconds.widget === "number" && seconds.min !== undefined && seconds.max !== undefined
      ? { min: seconds.min, max: seconds.max, step: seconds.step ?? 1, default: Number(seconds.default ?? seconds.min) } : null,
    qualities,
    defaultQuality: quality?.default !== undefined ? String(quality.default) : null,
    reference: ref ? { param: ref.param, label: ref.label, max: 1, accept: ref.accept } : null,
    canAnimate: output === "video" && !!ref && referenceReachable(manifest, defaults) && tryAll(true),
    canText: output === "video" && tryAll(false),
    soundPrefix: model.capabilities.includes("Native audio") ? "Soundscape" : "Sound",
  };
}
