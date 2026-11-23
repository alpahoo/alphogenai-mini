import { randomInt } from "node:crypto";
import { graphHash, InputError, type Graph } from "@/lib/comfy/template";
import { isOwnAudioPath, parseAudioFileName, AUDIO_DIR } from "./audio-library";
import { DEFAULT_PROMPT } from "./constants";
import { LIBRARY_DIR, parseFileName } from "@/lib/studio/reference-library";

/**
 * LongCat-Video-Avatar 1.6 template (admin only). There is no ComfyUI graph: the "graph" stored with the run is a small
 * descriptor of the approved inputs, hashed like any other graph so the broker can detect any tampering before the GPU
 * starts. Fixed, validated configuration (Luz recipe, 2026-11-23): H100, INT8, distilled 8 steps, 480p.
 * Only the portrait, the audio, an optional prompt and an optional seed are caller inputs.
 */
export const AVATAR_RUNTIME = "longcat-avatar@1";
export const AVATAR_TEMPLATE = "longcat-avatar@1";
export { AVATAR_FPS, DEFAULT_PROMPT, FIRST_SEGMENT_FRAMES, MAX_SEGMENTS, NEW_FRAMES_PER_SEGMENT, segmentsFor, videoSecondsFor } from "./constants";

export interface ResolvedAvatarRun {
  graph: Graph; hash: string; params: Record<string, string | number>;
  referencePath: string | null; variant: string; runtime: string; template: string;
}

/**
 * Bind the approved inputs. `image_path` and `audio_path` must be files of the caller's own libraries; nothing the
 * client sends is ever used as a storage path outside `<owner>/library/` and `<owner>/audio-library/`.
 */
export function resolveAvatar(input: unknown, ownerId: string): ResolvedAvatarRun {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid parameters");
  const source = input as Record<string, unknown>;
  for (const key of Object.keys(source)) if (!["image_path", "audio_path", "prompt", "seed"].includes(key)) throw new InputError(`Unknown or locked parameter: ${key}`);

  const image = source.image_path;
  const imagePrefix = `${ownerId}/${LIBRARY_DIR}/`;
  if (typeof image !== "string" || !image.startsWith(imagePrefix) || image.includes("..") || image.includes("//") ||
    !parseFileName(image.slice(imagePrefix.length))) throw new InputError("Choose a portrait from your private library");
  const audio = source.audio_path;
  if (!isOwnAudioPath(ownerId, audio)) throw new InputError("Choose an audio from your private audio library");

  const rawPrompt = source.prompt === undefined || source.prompt === "" ? DEFAULT_PROMPT : source.prompt;
  if (typeof rawPrompt !== "string" || rawPrompt.trim().length < 3 || rawPrompt.length > 600) throw new InputError("Prompt must contain 3–600 characters");
  let seed = source.seed;
  if (seed === undefined) seed = randomInt(0, 2 ** 31 - 1);
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 2 ** 31 - 1) throw new InputError("Invalid seed");

  const imageLabel = parseFileName(image.slice(imagePrefix.length))!.name;
  const audioLabel = parseAudioFileName(audio.slice(`${ownerId}/${AUDIO_DIR}/`.length))!.name;
  // `params` is what the history shows: names only, never storage paths.
  const params: Record<string, string | number> = {
    prompt: rawPrompt.trim(), seed, resolution: "480p", steps: 8, image_label: imageLabel, audio_label: audioLabel,
  };
  const graph: Graph = {
    "1": { class_type: "LongCatAvatar", inputs: {
      image_path: image, audio_path: audio, prompt: params.prompt, seed, resolution: "480p", steps: 8,
      precision: "int8", distilled: true, model: "avatar-v1.6", mix_steps: 4, mix_alpha: 1.0,
    } },
  };
  return { graph, hash: graphHash(graph), params, referencePath: image, variant: "avatar", runtime: AVATAR_RUNTIME, template: AVATAR_TEMPLATE };
}
