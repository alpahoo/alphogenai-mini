/**
 * Phase 4B: built-in presets, per model, shown in the Create panel without opening Advanced.
 *
 * A preset only sets parameters that the model's manifest declares, with values that manifest allows.
 * It never touches the seed, the audio advance, the negative prompt or any advanced setting, so the
 * administrator's own tuning survives. The prompt is only filled when it is empty (a starting point to edit),
 * never replaced. Applying a preset changes the form and nothing else: no generation, no authorization.
 */
import { resolveVariant, type ParamValues, type StudioManifest } from "./manifest";

export type PresetId = "cinematic" | "portrait" | "product" | "tutorial" | "vertical" | "landscape" | "night" | "dynamic";

export interface BuiltinPreset {
  id: PresetId;
  label: string;
  /** One line shown as a tooltip: what it sets and why. */
  hint: string;
  /** Manifest parameters only. */
  settings: ParamValues;
  /** English starting prompt, used only when the prompt field is empty. */
  promptStarter: string;
}

const H3: BuiltinPreset[] = [
  { id: "cinematic", label: "Cinematic", hint: "Landscape 16:9, 5 s, full quality", settings: { aspect: "16:9", seconds: 5, quality: "full" },
    promptStarter: "Cinematic realistic shot of a lone traveller crossing a windswept salt flat at golden hour. Slow dolly in, 35mm lens, shallow depth of field, natural film grain, warm highlights against cool shadows. Soundscape: wind, distant thunder, soft footsteps." },
  { id: "portrait", label: "Portrait / interview", hint: "Portrait 9:16, 8 s for speech, full quality", settings: { aspect: "9:16", seconds: 8, quality: "full" },
    promptStarter: "Medium close-up of a woman in a bright studio, soft key light, calm expression. After a short pause she says: \"Thank you for having me.\" Static camera, shallow depth of field. Soundscape: quiet room tone." },
  { id: "product", label: "Product ad", hint: "Square 1:1, 5 s, full quality", settings: { aspect: "1:1", seconds: 5, quality: "full" },
    promptStarter: "Premium product advertisement: a glass perfume bottle on a mirrored surface, slow orbiting camera, soft studio lighting with crisp reflections, a subtle mist. Soundscape: gentle ambient music, a soft chime." },
  { id: "tutorial", label: "Tutorial", hint: "Landscape 16:9, 10 s, turbo", settings: { aspect: "16:9", seconds: 10, quality: "turbo" },
    promptStarter: "Clean top-down tutorial shot of hands assembling a wooden shelf on a bright workbench, steady camera, even lighting, every step clearly visible. Soundscape: calm room tone, tools clicking, and after a short pause a narrator says slowly: \"First, align the two panels.\"" },
  { id: "vertical", label: "Vertical social", hint: "Portrait 9:16, 5 s, turbo", settings: { aspect: "9:16", seconds: 5, quality: "turbo" },
    promptStarter: "Vertical social video: a street musician plays guitar at dusk, handheld camera moving closer, neon signs glowing behind, a soft crowd passing. Soundscape: acoustic guitar, light crowd murmur." },
  { id: "landscape", label: "Landscape 16:9", hint: "Landscape 16:9, 5 s, turbo", settings: { aspect: "16:9", seconds: 5, quality: "turbo" },
    promptStarter: "Wide establishing shot of snowy mountains above a misty valley at sunrise, slow aerial push forward, soft golden light on the peaks. Soundscape: wind, distant birds." },
  { id: "night", label: "Night scene", hint: "Landscape 16:9, 6 s, full quality", settings: { aspect: "16:9", seconds: 6, quality: "full" },
    promptStarter: "Night scene on a rain-soaked city street, neon signs reflected on wet asphalt, cool blue shadows against warm amber streetlights, slow dolly in, light haze. Soundscape: steady rain, passing cars, distant footsteps." },
  { id: "dynamic", label: "Dynamic shot", hint: "Landscape 16:9, 4 s, turbo", settings: { aspect: "16:9", seconds: 4, quality: "turbo" },
    promptStarter: "Dynamic action shot: a cyclist sprints through a tunnel, fast tracking camera at wheel level, motion blur on the walls, flashes of light. Soundscape: whirring wheels, rhythmic breathing, echoing tunnel." },
];

const MOSS: BuiltinPreset[] = [
  { id: "cinematic", label: "Cinematic", hint: "Photo landscape 3:2", settings: { aspect: "3:2" },
    promptStarter: "Cinematic photograph of a lone traveller on a salt flat at golden hour, wide composition, 35mm lens, shallow depth of field, natural film grain, warm light." },
  { id: "portrait", label: "Portrait / interview", hint: "Photo portrait 2:3", settings: { aspect: "2:3" },
    promptStarter: "Studio portrait of a woman in soft window light, shoulders up, calm expression, 85mm lens, shallow depth of field, natural skin texture." },
  { id: "product", label: "Product ad", hint: "Square 1:1", settings: { aspect: "1:1" },
    promptStarter: "Premium product photograph of a glass perfume bottle on a mirrored surface, soft studio lighting, crisp reflections, clean background." },
  { id: "tutorial", label: "Tutorial", hint: "Landscape 4:3", settings: { aspect: "4:3" },
    promptStarter: "Clean flat-lay photograph of the parts and tools for assembling a wooden shelf, arranged neatly, bright even light, plain white background." },
  { id: "vertical", label: "Vertical social", hint: "Tall 9:16", settings: { aspect: "9:16" },
    promptStarter: "Vertical social media poster: a street musician at dusk, neon signs, bold composition, empty space at the top for a title." },
  { id: "landscape", label: "Landscape 16:9", hint: "Wide 16:9", settings: { aspect: "16:9" },
    promptStarter: "Wide landscape photograph of snowy mountains above a misty valley at sunrise, soft golden light." },
  { id: "night", label: "Night scene", hint: "Photo landscape 3:2", settings: { aspect: "3:2" },
    promptStarter: "Night street photograph, rain-soaked asphalt, neon reflections, cool blue shadows and warm amber streetlights, long exposure." },
  { id: "dynamic", label: "Dynamic shot", hint: "Wide 16:9", settings: { aspect: "16:9" },
    promptStarter: "Dynamic action photograph of a cyclist sprinting through a tunnel, motion blur on the walls, low angle, high contrast." },
];

const BY_MODEL: Record<string, BuiltinPreset[]> = { "minimax-h3": H3, "moss-image": MOSS };

export function builtinPresetsFor(slug: string): BuiltinPreset[] {
  return BY_MODEL[slug] ?? [];
}

export interface PresetResult {
  values: ParamValues;
  /** Keys whose value really changed. */
  changed: string[];
  /** Settings not applied because the current combination would have no validated workflow. */
  skipped: string[];
  /** True when the prompt field was empty and received the starter. */
  promptFilled: boolean;
}

/**
 * Pure: the form after applying `preset`. Only declared parameters are written, the prompt is kept unless
 * empty, and a setting that would leave the current combination without a workflow (for example full
 * quality with a first frame attached) is skipped rather than applied.
 */
export function applyBuiltinPreset(manifest: StudioManifest, values: ParamValues, preset: BuiltinPreset, hasReference: boolean): PresetResult {
  const declared = new Set(manifest.params.map(p => p.key));
  const next: ParamValues = { ...values };
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(preset.settings)) {
    if (!declared.has(key) || key === "prompt") continue;
    if (hasReference && (manifest.studio?.variant_axes ?? []).includes(key) && resolveVariant(manifest, { ...next, [key]: value }, true) === null) {
      skipped.push(key);
      continue;
    }
    next[key] = value;
  }
  const promptEmpty = String(values.prompt ?? "").trim() === "";
  if (promptEmpty && declared.has("prompt")) next.prompt = preset.promptStarter;
  const changed = Object.keys(next).filter(k => String(next[k]) !== String(values[k]));
  return { values: next, changed, skipped, promptFilled: promptEmpty && declared.has("prompt") };
}

export function presetNotice(manifest: StudioManifest, preset: BuiltinPreset, result: PresetResult): string {
  const labels = result.changed.filter(k => k !== "prompt").map(k => manifest.params.find(p => p.key === k)?.label ?? k);
  const parts = [`Preset “${preset.label}” applied.`];
  parts.push(labels.length ? `Changed: ${labels.join(", ")}.` : "Settings already matched.");
  if (result.skipped.length) parts.push(`Not applied with a first frame: ${result.skipped.join(", ")}.`);
  parts.push(result.promptFilled ? "A starting prompt was added; edit it freely." : "Your prompt was kept.");
  return parts.join(" ");
}
