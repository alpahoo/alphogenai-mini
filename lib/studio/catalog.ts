import h3Manifest from "@/workflows/comfy/templates/minimax-h3/manifest.json";
import h3T2v from "@/workflows/comfy/templates/minimax-h3/graph.t2v.api.json";
import h3T2vFull from "@/workflows/comfy/templates/minimax-h3/graph.t2v_full.api.json";
import h3I2v from "@/workflows/comfy/templates/minimax-h3/graph.i2v.api.json";
import mossManifest from "@/workflows/comfy/templates/moss-image/manifest.json";
import mossT2i from "@/workflows/comfy/templates/moss-image/graph.t2i.api.json";
import avatarManifest from "@/workflows/comfy/templates/longcat-avatar/manifest.json";
import type { StudioManifest } from "./manifest";

export type OutputKind = "video" | "image";
type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export interface StudioModel {
  slug: string;
  title: string;
  kind: OutputKind;
  tagline: string;
  /** "available" = wired end to end (still subject to the server gate). "pending" = listed, never runnable. */
  availability: "available" | "pending";
  /** Needs an owner licence confirmation in the server gate before any run. */
  requiresValidation?: boolean;
  pendingReason?: string;
  manifest?: StudioManifest;
  graphs?: Record<string, Graph>;
  capabilities: string[];
}

export const STUDIO_MODELS: StudioModel[] = [
  {
    slug: "minimax-h3",
    title: "MiniMax H3",
    kind: "video",
    tagline: "Video with native audio",
    availability: "available",
    manifest: h3Manifest as unknown as StudioManifest,
    graphs: { t2v: h3T2v as Graph, t2v_full: h3T2vFull as Graph, i2v: h3I2v as Graph },
    capabilities: ["Text to video", "Image to video (turbo)", "Native audio", "Original + audio-corrected outputs"],
  },
  {
    slug: "moss-image",
    title: "MOSS-Image",
    kind: "image",
    tagline: "Text to image · 1 MP",
    availability: "available",
    requiresValidation: true,
    manifest: mossManifest as unknown as StudioManifest,
    graphs: { t2i: mossT2i as Graph },
    capabilities: ["Text to image", "Seven aspect ratios", "PNG, JPEG, WebP downloads"],
  },
  {
    // Not created from this form: it needs a portrait AND an audio from two private libraries, so it has its own
    // screen. Listed here so its runs show with the right title in the history instead of falling back to H3.
    slug: "longcat-avatar",
    title: "Talking avatar",
    kind: "video",
    tagline: "Portrait + audio to speaking video",
    availability: "pending",
    pendingReason: "Create talking avatars on their own screen: Studio → Talking avatar (/admin/studio/avatar).",
    manifest: avatarManifest as unknown as StudioManifest,
    capabilities: ["Portrait + audio to video", "About 10 seconds, 480p", "Private library and MP4 download"],
  },
];

export function findModel(slug: string | null | undefined): StudioModel | undefined {
  return STUDIO_MODELS.find(m => m.slug === slug);
}

/** Client-safe mapping from a run's `template_version` (e.g. "moss-image@1") to its Studio model. */
export function modelForTemplateVersion(version: string | null | undefined): StudioModel {
  const slug = version?.split("@")[0];
  return STUDIO_MODELS.find(m => m.slug === slug && m.manifest) ?? STUDIO_MODELS[0];
}

export function modelsFor(kind: OutputKind): StudioModel[] {
  return STUDIO_MODELS.filter(m => m.kind === kind);
}

export interface LockedSetting { label: string; value: string }

const LOCKED_READERS: Record<string, (inputs: Record<string, unknown>) => LockedSetting[]> = {
  KSamplerSelect: i => [{ label: "Sampler", value: String(i.sampler_name) }],
  BasicScheduler: i => [{ label: "Scheduler", value: String(i.scheduler) }, { label: "Steps", value: String(i.steps) }],
  LoraLoaderModelOnly: i => [{ label: "Turbo LoRA strength", value: String(i.strength_model) }],
  CreateVideo: i => [{ label: "Frame rate", value: `${i.fps} fps` }],
  CLIPLoader: i => [{ label: "Text encoder", value: String(i.clip_name).replace(/\.safetensors$/, "") }],
  UNETLoader: i => [{ label: "Diffusion model", value: String(i.unet_name).replace(/\.safetensors$/, "") }],
  VAELoader: i => [{ label: "VAE", value: String(i.vae_name).replace(/\.safetensors$/, "") }],
  KSampler: i => [{ label: "Denoise", value: String(i.denoise) }],
  EmptyFlux2LatentImage: i => [{ label: "Batch size", value: String(i.batch_size) }],
};

/** Read-only values that come from the exported graph of the chosen variant (never written by the Studio). */
export function lockedSettings(model: StudioModel, variant: string | null): LockedSetting[] {
  const graph = variant ? model.graphs?.[variant] : undefined;
  if (!graph) return [];
  const out: LockedSetting[] = [];
  for (const node of Object.values(graph)) out.push(...(LOCKED_READERS[node.class_type]?.(node.inputs) ?? []));
  return out;
}

/** H3 official frame count for a duration, identical to the server binding. */
export function h3Frames(seconds: number): number {
  const n = Math.max(5, Math.round(seconds * 24));
  return n + ((5 - (n % 17) + 17) % 17);
}
