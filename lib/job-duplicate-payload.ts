import type { EngineKey, ReferencePayload } from "@/lib/types";

export type DuplicateStoryboardScene = {
  prompt?: unknown;
  duration_sec?: unknown;
  engine?: unknown;
};

export type DuplicateJobSource = {
  prompt?: unknown;
  target_duration_seconds?: unknown;
  engine_used?: unknown;
  image_url?: unknown;
  references_payload?: unknown;
  storyboard?: unknown;
  byteplus_asset_ids?: unknown;
  multi_scene_chain?: unknown;
  chain_strategy?: unknown;
  audio_mode?: unknown;
  audio_prompt?: unknown;
  voiceover_text?: unknown;
  aspect_ratio?: unknown;
  caption_mode?: unknown;
  caption_style?: unknown;
  avatar_final?: unknown;
};

export type DuplicateJobPayload = {
  prompt: string;
  target_duration_seconds?: number;
  preferred_engine?: string;
  image_url?: string;
  references?: ReferencePayload;
  scenes?: Array<{ prompt: string; duration_sec?: number; engine?: string }>;
  byteplus_asset_ids?: string[];
  multi_scene_chain?: boolean;
  chain_strategy?: "anchor" | "continuity";
  audio_mode?: "none" | "auto" | "custom";
  audio_prompt?: string;
  voiceover_text?: string;
  aspect_ratio?: "16:9" | "9:16" | "1:1";
  caption_mode?: "none" | "auto" | "custom";
  caption_style?: string;
};

export type DuplicateJobPayloadResult =
  | { ok: true; payload: DuplicateJobPayload }
  | { ok: false; status: number; error: string };

const AVATAR_ENGINES = new Set(["heygen_avatar_iv", "heygen_avatar_shots"]);
const ASPECT_RATIOS = new Set(["16:9", "9:16", "1:1"]);
const CAPTION_MODES = new Set(["none", "auto", "custom"]);
const AUDIO_MODES = new Set(["none", "auto", "custom"]);
const CHAIN_STRATEGIES = new Set(["anchor", "continuity"]);

function asTrimmedString(value: unknown, maxLength?: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return typeof maxLength === "number" ? trimmed.slice(0, maxLength) : trimmed;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikeReferencePayload(value: unknown): value is ReferencePayload {
  if (!isPlainObject(value)) return false;
  return ["images", "videos", "audio"].some((key) => Array.isArray(value[key]));
}

function buildDuplicateScenes(storyboard: unknown): DuplicateJobPayload["scenes"] | undefined {
  if (!Array.isArray(storyboard)) return undefined;

  const scenes = storyboard
    .map((scene) => {
      if (!isPlainObject(scene)) return null;
      const prompt = asTrimmedString(scene.prompt, 2000);
      if (!prompt) return null;

      const duration = asFiniteNumber(scene.duration_sec);
      const engine = asTrimmedString(scene.engine);

      return {
        prompt,
        ...(duration ? { duration_sec: duration } : {}),
        ...(engine && engine !== "auto" ? { engine } : {}),
      };
    })
    .filter((scene): scene is NonNullable<typeof scene> => Boolean(scene));

  return scenes.length ? scenes : undefined;
}

export function isUnsupportedAvatarDuplicate(job: DuplicateJobSource): boolean {
  const engine = asTrimmedString(job.engine_used);
  return Boolean((engine && AVATAR_ENGINES.has(engine)) || job.avatar_final);
}

export function buildDuplicateJobPayload(job: DuplicateJobSource): DuplicateJobPayloadResult {
  if (isUnsupportedAvatarDuplicate(job)) {
    return {
      ok: false,
      status: 409,
      error: "Duplicate is not available for avatar jobs yet. Use this job as a reference instead.",
    };
  }

  const prompt = asTrimmedString(job.prompt, 4000);
  if (!prompt) {
    return { ok: false, status: 400, error: "Original job prompt is missing." };
  }

  const payload: DuplicateJobPayload = { prompt };

  const duration = asFiniteNumber(job.target_duration_seconds);
  if (duration) payload.target_duration_seconds = duration;

  const engine = asTrimmedString(job.engine_used);
  if (engine) payload.preferred_engine = engine as EngineKey;

  const imageUrl = asTrimmedString(job.image_url);
  if (imageUrl) payload.image_url = imageUrl;

  if (looksLikeReferencePayload(job.references_payload)) {
    payload.references = job.references_payload;
  }

  const scenes = buildDuplicateScenes(job.storyboard);
  if (scenes) payload.scenes = scenes;

  if (Array.isArray(job.byteplus_asset_ids)) {
    const assetIds = job.byteplus_asset_ids
      .map((value) => asTrimmedString(value))
      .filter((value): value is string => Boolean(value));
    if (assetIds.length) payload.byteplus_asset_ids = assetIds;
  }

  if (typeof job.multi_scene_chain === "boolean") {
    payload.multi_scene_chain = job.multi_scene_chain;
  }

  const chainStrategy = asTrimmedString(job.chain_strategy);
  if (chainStrategy && CHAIN_STRATEGIES.has(chainStrategy)) {
    payload.chain_strategy = chainStrategy as DuplicateJobPayload["chain_strategy"];
  }

  const audioMode = asTrimmedString(job.audio_mode);
  if (audioMode && AUDIO_MODES.has(audioMode)) {
    payload.audio_mode = audioMode as DuplicateJobPayload["audio_mode"];
  }

  const audioPrompt = asTrimmedString(job.audio_prompt, 500);
  if (audioPrompt) payload.audio_prompt = audioPrompt;

  const voiceoverText = asTrimmedString(job.voiceover_text, 2000);
  if (voiceoverText) payload.voiceover_text = voiceoverText;

  const aspectRatio = asTrimmedString(job.aspect_ratio);
  if (aspectRatio && ASPECT_RATIOS.has(aspectRatio)) {
    payload.aspect_ratio = aspectRatio as DuplicateJobPayload["aspect_ratio"];
  }

  const captionMode = asTrimmedString(job.caption_mode);
  if (captionMode && CAPTION_MODES.has(captionMode)) {
    payload.caption_mode = captionMode as DuplicateJobPayload["caption_mode"];
  }

  const captionStyle = asTrimmedString(job.caption_style, 100);
  if (captionStyle) payload.caption_style = captionStyle;

  return { ok: true, payload };
}
