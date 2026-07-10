import type { PodcastLipsyncMode, PodcastLipsyncProviderId } from "./lipsync-provider";

export const PODCAST_LIPSYNC_QUALITY_MODES = [
  "economy",
  "balanced",
  "premium",
  "cinema",
] as const;

export type PodcastLipsyncQualityMode = (typeof PODCAST_LIPSYNC_QUALITY_MODES)[number];
export type PodcastLipsyncQualityStatus = "available" | "planned";

export interface PodcastLipsyncQualityPreset {
  id: PodcastLipsyncQualityMode;
  publicLabel: string;
  publicDescription: string;
  providerId: PodcastLipsyncProviderId;
  providerMode: PodcastLipsyncMode;
  status: PodcastLipsyncQualityStatus;
  internalNote: string;
}

export interface PodcastLipsyncRoutingPlan extends PodcastLipsyncQualityPreset {
  requestedQualityMode: PodcastLipsyncQualityMode;
  effectiveQualityMode: PodcastLipsyncQualityMode;
  fallbackReason?: string;
}

export const DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE: PodcastLipsyncQualityMode = "premium";

export const PODCAST_LIPSYNC_QUALITY_PRESETS = {
  economy: {
    id: "economy",
    publicLabel: "Economy",
    publicDescription: "Lower-cost sync for drafts and high-volume runs.",
    providerId: "heygen",
    providerMode: "speed",
    status: "planned",
    internalNote: "Reserved for self-hosted or lower-cost providers after benchmark hardening.",
  },
  balanced: {
    id: "balanced",
    publicLabel: "Balanced",
    publicDescription: "Best trade-off between quality, cost, and turnaround time.",
    providerId: "heygen",
    providerMode: "precision",
    status: "planned",
    internalNote: "Reserved for provider arbitration once more production candidates are available.",
  },
  premium: {
    id: "premium",
    publicLabel: "Premium",
    publicDescription: "Production-quality sync for polished podcast exports.",
    providerId: "heygen",
    providerMode: "precision",
    status: "available",
    internalNote: "Current production baseline from T-1144b QA.",
  },
  cinema: {
    id: "cinema",
    publicLabel: "Cinema",
    publicDescription: "Highest-quality render path for studio-grade outputs.",
    providerId: "heygen",
    providerMode: "precision",
    status: "planned",
    internalNote: "Reserved for Runway/Act-Two or equivalent once benchmarked and cost-gated.",
  },
} satisfies Record<PodcastLipsyncQualityMode, PodcastLipsyncQualityPreset>;

export function isPodcastLipsyncQualityMode(value: unknown): value is PodcastLipsyncQualityMode {
  return typeof value === "string" && PODCAST_LIPSYNC_QUALITY_MODES.includes(value as PodcastLipsyncQualityMode);
}

export function listPodcastLipsyncQualityPresets(): PodcastLipsyncQualityPreset[] {
  return PODCAST_LIPSYNC_QUALITY_MODES.map((mode) => PODCAST_LIPSYNC_QUALITY_PRESETS[mode]);
}

export function getPodcastLipsyncQualityPreset(
  mode: PodcastLipsyncQualityMode = DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE,
): PodcastLipsyncQualityPreset {
  return PODCAST_LIPSYNC_QUALITY_PRESETS[mode];
}

export function resolvePodcastLipsyncRoutingPlan(options?: {
  qualityMode?: unknown;
  allowPlanned?: boolean;
}): PodcastLipsyncRoutingPlan {
  const requestedQualityMode = isPodcastLipsyncQualityMode(options?.qualityMode)
    ? options.qualityMode
    : DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE;
  const requestedPreset = getPodcastLipsyncQualityPreset(requestedQualityMode);

  if (requestedPreset.status === "available" || options?.allowPlanned) {
    return {
      ...requestedPreset,
      requestedQualityMode,
      effectiveQualityMode: requestedQualityMode,
    };
  }

  const fallbackPreset = getPodcastLipsyncQualityPreset(DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE);

  return {
    ...fallbackPreset,
    requestedQualityMode,
    effectiveQualityMode: fallbackPreset.id,
    fallbackReason: `${requestedQualityMode} is not production-routed yet`,
  };
}
