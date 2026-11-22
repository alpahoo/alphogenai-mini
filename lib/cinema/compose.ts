/**
 * The Cinema prompt composer: turns a shot, its project and its cast into the prompt and the parameters a
 * Studio model's manifest accepts, and picks the reference image to send.
 *
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/server/cinema/compose.ts. Differences: it works on Studio manifests instead of a model registry, a model
 * takes at most the references its manifest declares (H3: one first frame), the first usable reference of the
 * cast is the one sent, and the quality is chosen so that a valid workflow exists. See lib/cinema/LICENSE-parallax.txt.
 *
 * Pure apart from an optional `exists` check supplied by the caller: the same input always gives the same output.
 * It never calls the network, the database or storage, never starts a generation and touches no gate or budget.
 *
 * Sentence order (empty parts are left out):
 *   1. Framing      "<Shot size> <angle>."
 *   2. Action       "<action>."
 *   3. Cast         "Featuring <name> (<description>); ..."  characters and props, in cast order
 *   4. Place        "Location: <name>, <description>."
 *   5. Camera       movement sentence (video only), "Shot with a <lens>, <depth of field>."
 *   6. Light, mood  "Lighting: ... Mood: ..."
 *   7. Look         "Look: <film stock>, <grade>, <lens family>."
 *   8. Sound        "Soundscape: <note>." (video only; "Sound:" for a model without native audio)
 * The result is cut to the model's prompt limit.
 */
import { defaultValues, resolveVariant, submissionParams, type ParamValues } from "@/lib/studio/manifest";
import type { StudioModel } from "@/lib/studio/catalog";
import { modelView, type ModelView } from "./model-view";
import { ANGLES, FILM_STOCKS, FOCUS, GRADES, LENSES, LENS_FAMILIES, LIGHTING_STYLES, MOODS, MOVEMENTS, SHOT_SIZES, presetById } from "./presets";

export type Mode = "still" | "animate" | "text";
export type ElementKind = "character" | "location" | "prop";

export interface Look { filmStock?: string; grade?: string; lensFamily?: string; lighting?: string }
export interface Project { aspect: string; look: Look }
/** Cast, place or prop. `refPaths` are private reference paths (library images), in the order of the fiche. */
export interface Element { id: string; kind: ElementKind; name: string; description: string; refPaths: string[] }
export interface Shot {
  action: string; size: string; angle: string; movement: string; lens: string; focus: string; lighting: string; mood: string;
  /** Planned seconds. */
  duration: number; sound: string; castIds: string[]; locationId: string | null;
}

export class CinemaError extends Error {
  constructor(public code: "wrong_model" | "no_first_frame" | "no_variant", message: string) { super(message); }
}

export interface Composed {
  modelSlug: string;
  mode: Mode;
  prompt: string;
  /** Form values for the model, including the prompt. Passed as is to `submissionParams` and the run API. */
  values: ParamValues;
  /** The one reference sent to the workflow (H3: the first frame), or null. */
  referencePath: string | null;
  /** Things the member may want to know: references left out, a ratio the model lacks... */
  notes: string[];
}

/** What a shot with nothing filled in sends as its prompt. */
export const EMPTY_PROMPT = "A cinematic shot.";

const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const cap = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
};
const describe = (e: Element) => (e.description ? `${e.name} (${e.description})` : e.name);

export function composePrompt(project: Project, shot: Shot, elements: Element[], mode: Mode, soundPrefix: string = "Sound"): string {
  const byId = new Map(elements.map(e => [e.id, e]));
  const cast = shot.castIds.map(id => byId.get(id)).filter((e): e is Element => !!e);
  const place = shot.locationId ? byId.get(shot.locationId) : undefined;
  const look = project.look;
  const motion = mode !== "still";

  const size = presetById(SHOT_SIZES, shot.size)?.phrase;
  const angle = presetById(ANGLES, shot.angle)?.phrase;
  const lens = presetById(LENSES, shot.lens)?.phrase;
  const focus = presetById(FOCUS, shot.focus)?.phrase;
  const lighting = presetById(LIGHTING_STYLES, shot.lighting || look.lighting)?.phrase;
  const mood = presetById(MOODS, shot.mood)?.phrase;
  const lookParts = [presetById(FILM_STOCKS, look.filmStock)?.phrase, presetById(GRADES, look.grade)?.phrase, presetById(LENS_FAMILIES, look.lensFamily)?.phrase].filter(Boolean);

  const parts = [
    sentence([size ?? (angle ? "Shot" : ""), angle].filter(Boolean).join(" ")),
    sentence(shot.action),
    cast.length ? sentence(`Featuring ${cast.map(describe).join("; ")}`) : "",
    place ? sentence(`Location: ${place.description ? `${place.name}, ${place.description}` : place.name}`) : "",
    motion ? (presetById(MOVEMENTS, shot.movement)?.phrase ?? "") : "",
    lens || focus ? sentence(`Shot with ${[lens ? `a ${lens}` : "", focus].filter(Boolean).join(", ")}`) : "",
    lighting ? sentence(`Lighting: ${lighting}`) : "",
    mood ? sentence(`Mood: ${mood}`) : "",
    lookParts.length ? sentence(`Look: ${lookParts.join(", ")}`) : "",
    motion && shot.sound ? sentence(`${soundPrefix}: ${shot.sound}`) : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * The same rule the run API applies to a reference path (lib/comfy/template.ts): inside the owner's own folder,
 * no `..`, only letters, digits, underscore, slash and dash, and a png/jpg/webp extension.
 */
export function usableReferencePath(userId: string, path: string): boolean {
  return typeof path === "string" && path.startsWith(`${userId}/`) && !path.includes("..") && /^[a-zA-Z0-9_/-]+\.(png|jpg|webp)$/.test(path);
}

/**
 * Reference images in a fixed order: cast (in cast order), then the place. A path that is not the owner's, is not a
 * valid image path, or does not exist (per `exists`) is skipped and counted. Duplicates are kept once.
 */
export function gatherReferences(userId: string, shot: Shot, elements: Element[], exists: (path: string) => boolean = () => true) {
  const byId = new Map(elements.map(e => [e.id, e]));
  const order = [...shot.castIds, ...(shot.locationId ? [shot.locationId] : [])];
  const usable: string[] = []; let skipped = 0;
  for (const id of order) {
    for (const path of byId.get(id)?.refPaths ?? []) {
      if (usable.includes(path)) continue;
      if (usableReferencePath(userId, path) && exists(path)) usable.push(path); else skipped++;
    }
  }
  return { usable, skipped };
}

const snap = (v: number, min: number, max: number, step: number) => Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));

/** Values every take sends: the ratio, and for video the length and a quality that has a workflow. */
function baseValues(view: ModelView, mode: Mode, project: Project, shot: Shot, hasReference: boolean, notes: string[]): ParamValues {
  const values: ParamValues = {};
  if (view.aspects.length) {
    if (view.aspects.includes(project.aspect)) values.aspect = project.aspect;
    else { values.aspect = view.defaultAspect ?? view.aspects[0]; notes.push(`${view.title} cannot make ${project.aspect}; it uses ${values.aspect} instead.`); }
  }
  if (mode !== "still" && view.duration) {
    const d = snap(shot.duration, view.duration.min, view.duration.max, view.duration.step);
    values.seconds = d;
    if (d !== shot.duration) notes.push(`${view.title} makes ${view.duration.min} to ${view.duration.max} seconds; this shot uses ${d} s instead of ${shot.duration} s.`);
  }
  if (mode !== "still" && view.qualities.length) {
    // The default if it has a workflow for this case, else the first quality that does (H3 with a first frame: turbo only).
    const works = (q: string) => resolveVariant(view.manifest, { ...values, quality: q }, hasReference) !== null;
    const wanted = view.defaultQuality ?? view.qualities[0];
    const chosen = works(wanted) ? wanted : view.qualities.find(works);
    if (!chosen) throw new CinemaError("no_variant", `${view.title} has no workflow for this combination.`);
    values.quality = chosen;
    if (chosen !== wanted) notes.push(`Quality set to ${chosen}: it is the only validated workflow with a first frame.`);
  }
  return values;
}

export function composeShot(opts: {
  userId: string; project: Project; shot: Shot; elements: Element[]; mode: Mode; model: StudioModel;
  /** Existence check for reference files, supplied by the caller (storage). Defaults to "exists". */
  exists?: (path: string) => boolean;
  /** Explicit overrides (for example quality "full" for a text take). Only declared parameters are kept. */
  values?: ParamValues;
}): Composed {
  const { userId, project, shot, elements, mode, model } = opts;
  const view = modelView(model);
  const notes: string[] = [];
  if (mode === "still" && view.output !== "image") throw new CinemaError("wrong_model", `${view.title} makes video: pick an image model for stills.`);
  if (mode === "animate" && !view.canAnimate) throw new CinemaError("wrong_model", `${view.title} cannot start from a first image.`);
  if (mode === "text" && !view.canText) throw new CinemaError("wrong_model", `${view.title} cannot make video from text alone.`);

  const { usable, skipped } = gatherReferences(userId, shot, elements, opts.exists);
  let referencePath: string | null = null;
  if (mode === "animate") {
    if (!usable.length) throw new CinemaError("no_first_frame", "This shot has no usable reference image for the first frame. Add one to the cast or the place.");
    referencePath = usable[0];
    const left = usable.length - 1, max = view.reference?.max ?? 1;
    if (left > 0) notes.push(`${view.title} takes ${max} reference image${max > 1 ? "s" : ""} (the ${view.reference?.label.toLowerCase() ?? "reference"}); ${left} other${left > 1 ? "s were" : " was"} left out.`);
  } else if (usable.length && mode === "text") {
    notes.push("Video from text alone does not use reference images. Use a first frame to keep the look.");
  } else if (usable.length && mode === "still" && !view.reference) {
    notes.push(`${view.title} does not take reference images, so the cast and place pictures are not used.`);
  }
  if (skipped) notes.push(`${skipped} reference image${skipped > 1 ? "s were" : " was"} not usable (not yours, not an image path, or no longer stored) and skipped.`);

  let prompt = composePrompt(project, shot, elements, mode, view.soundPrefix) || EMPTY_PROMPT;
  if (prompt.length > view.maxPrompt) { prompt = prompt.slice(0, view.maxPrompt); notes.push(`The prompt was cut to ${view.maxPrompt} characters for ${view.title}.`); }

  // Same starting point as the Studio form: the manifest's own defaults (for H3 the validated 0.4 s audio advance), then the shot.
  const values: ParamValues = { ...defaultValues(view.manifest), prompt, ...baseValues(view, mode, project, shot, referencePath !== null, notes) };
  // Explicit overrides win, but only for parameters the manifest declares, and never for the prompt or the reference.
  const declared = new Set(view.manifest.params.map(p => p.key));
  for (const [k, v] of Object.entries(opts.values ?? {})) if (k !== "prompt" && declared.has(k)) values[k] = v;
  if (mode !== "still" && resolveVariant(view.manifest, values, referencePath !== null) === null) {
    // An override asked for a combination without a workflow (full quality with a first frame): fall back to the quality that works.
    const q = view.qualities.find(x => resolveVariant(view.manifest, { ...values, quality: x }, referencePath !== null) !== null);
    if (!q) throw new CinemaError("no_variant", `${view.title} has no workflow for this combination.`);
    notes.push(`Quality set to ${q}: it is the only validated workflow with a first frame.`);
    values.quality = q;
  }
  return { modelSlug: view.slug, mode, prompt, values, referencePath, notes };
}

/** The parameter object the run API expects (`POST /api/admin/comfy/runs`, field `params`). */
export function toRunParams(model: StudioModel, composed: Composed): Record<string, string | number> {
  const view = modelView(model);
  return submissionParams(view.manifest, composed.values, composed.referencePath);
}
