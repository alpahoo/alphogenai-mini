/**
 * Phase 4B: model-specific prompting guidance for the Studio assistant.
 *
 * Built from the manifest wherever a number exists there (resolutions, durations, steps, options) so the
 * assistant can never promise a capability the workflow does not have, and the text cannot drift from the
 * manifest. Guidance is instruction text for the language model only: it changes what the assistant says
 * and proposes, never what the server accepts (the binder stays the authority) and never starts a generation.
 */
import type { ManifestParam, StudioManifest } from "../manifest";

const param = (m: StudioManifest, key: string): ManifestParam | undefined => m.params.find(p => p.key === key);

function resolutionsText(m: StudioManifest): string {
  const entries = Object.entries(m.resolutions ?? {});
  return entries.length ? entries.map(([aspect, size]) => `${size.join("x")} (${aspect})`).join(", ") : "the sizes listed by get_config";
}

const LANGUAGE_RULE =
  "Talk with the administrator in their language (often French). Write the final generation prompt itself in English, " +
  "even when the administrator writes in French, unless they ask for another language or the picture must contain text in a given language " +
  "(keep that text exactly as they wrote it). Say in one short sentence that the prompt is in English.";

function h3Guidance(m: StudioManifest): string {
  const seconds = param(m, "seconds");
  const quality = param(m, "quality");
  const aspect = param(m, "aspect");
  return [
    "Model guidance: MiniMax H3, text to video with native audio.",
    `- Real output: ${resolutionsText(m)} at 24 fps, ${seconds?.min ?? 2} to ${seconds?.max ?? 10} seconds. This is about 480p. Never promise HD, 4K, upscaling or any other resolution or frame rate.`,
    "- Final prompt: one English paragraph in this order: subject and action, setting, camera movement and lens, lighting and mood, texture details, then a sentence starting with \"Soundscape:\" (ambient sound, effects, music).",
    `- Prompts are limited to ${param(m, "prompt")?.maxLength ?? 2000} characters.`,
    "- Dialogue is possible. Allow about 2.5 words per second plus 1.5 seconds, and raise the duration if needed.",
    "- A post-process advances the audio by 0.4 seconds, which trims the very start of the sound. Do not place speech or a key sound in the first half second; if the administrator wants immediate speech, warn them about it.",
    `- Settings you may propose: format (${(aspect?.options ?? []).join(", ")}), duration, quality (${(quality?.options ?? []).join(" or ")}). Turbo is the fast 8 step mode; full is the 20 step mode. Image to video exists only in turbo, so if a first frame is attached do not propose full.`,
    "- Do not change the seed or the audio advance unless the administrator asks for it.",
  ].join("\n");
}

function mossGuidance(m: StudioManifest): string {
  const steps = param(m, "steps");
  const cfg = param(m, "cfg");
  const aspect = param(m, "aspect");
  return [
    "Model guidance: MOSS-Image, text to image of about one megapixel.",
    `- Real output: ${resolutionsText(m)}. Never promise a larger size, upscaling, video or a reference image: this model takes none.`,
    "- Final prompt: one English paragraph: subject, composition and framing, lighting, style or medium, then fine details. Text that must appear in the picture goes in quotation marks, in its original language.",
    `- Prompts are limited to ${param(m, "prompt")?.maxLength ?? 2000} characters.`,
    `- The format comes from the aspect setting (${(aspect?.options ?? []).join(", ")}); the resolution follows it.`,
    `- The negative prompt lists what to avoid. Steps (${steps?.min}-${steps?.max}, official ${steps?.default}) and guidance (${cfg?.min}-${cfg?.max}, official ${cfg?.default}) are advanced: keep the official values unless the administrator asks, more steps cost more GPU time.`,
  ].join("\n");
}

/** Guidance text for a template, or an empty string for an unknown template (the generic rules still apply). */
export function modelGuidance(manifest: StudioManifest): string {
  if (manifest.slug === "minimax-h3") return h3Guidance(manifest);
  if (manifest.slug === "moss-image") return mossGuidance(manifest);
  return "";
}

export { LANGUAGE_RULE };
