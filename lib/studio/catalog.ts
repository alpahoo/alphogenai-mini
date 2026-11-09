import h3Manifest from "@/workflows/comfy/templates/minimax-h3/manifest.json";
import h3T2v from "@/workflows/comfy/templates/minimax-h3/graph.t2v.api.json";
import h3T2vFull from "@/workflows/comfy/templates/minimax-h3/graph.t2v_full.api.json";
import h3I2v from "@/workflows/comfy/templates/minimax-h3/graph.i2v.api.json";
import mossManifest from "@/workflows/comfy/templates/moss-image/manifest.json";
import mossT2i from "@/workflows/comfy/templates/moss-image/graph.t2i.api.json";
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
  /** Server reservation per run, mirrored from the admission SQL (not an invoice). */
  reservationUsd?: number;
  /** Measured or estimated cost, always labelled as such. */
  costNote?: string;
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
    reservationUsd: 0.75,
    costNote: "Estimated $0.15–0.30 for a 5 s turbo clip (first pilot; invoice not yet reconciled).",
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
    reservationUsd: 0.20,
    costNote: "Estimated $0.03–0.10 per image on L40S (not measured yet; invoice reconciliation pending).",
    capabilities: ["Text to image", "Seven aspect ratios", "PNG, JPEG, WebP downloads"],
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
