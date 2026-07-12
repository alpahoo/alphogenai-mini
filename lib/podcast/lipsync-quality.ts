export const PODCAST_LIPSYNC_QUALITY_MODES = [
  "economy",
  "balanced",
  "premium",
  "cinema",
] as const;

export type PodcastLipsyncQualityMode = (typeof PODCAST_LIPSYNC_QUALITY_MODES)[number];
export type PodcastLipsyncQualityStatus = "available" | "planned";

export interface PublicPodcastLipsyncQualityPreset {
  id: PodcastLipsyncQualityMode;
  label: string;
  description: string;
  status: PodcastLipsyncQualityStatus;
}

export interface PublicPodcastLipsyncQualitySelection {
  requestedMode: PodcastLipsyncQualityMode;
  effectiveMode: PodcastLipsyncQualityMode;
  fallbackNotice?: string;
}

export const DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE: PodcastLipsyncQualityMode = "premium";

const PUBLIC_PODCAST_LIPSYNC_QUALITY_PRESETS = {
  economy: {
    id: "economy",
    label: "Economy",
    description: "Lower-cost sync for drafts and high-volume runs.",
    status: "planned",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Best trade-off between quality, cost, and turnaround time.",
    status: "planned",
  },
  premium: {
    id: "premium",
    label: "Premium",
    description: "Production-quality sync for polished podcast exports.",
    status: "available",
  },
  cinema: {
    id: "cinema",
    label: "Cinema",
    description: "Highest-quality render path for studio-grade outputs.",
    status: "planned",
  },
} satisfies Record<PodcastLipsyncQualityMode, PublicPodcastLipsyncQualityPreset>;

export function isPodcastLipsyncQualityMode(value: unknown): value is PodcastLipsyncQualityMode {
  return typeof value === "string" && PODCAST_LIPSYNC_QUALITY_MODES.includes(value as PodcastLipsyncQualityMode);
}

export function listPublicPodcastLipsyncQualityPresets(): PublicPodcastLipsyncQualityPreset[] {
  return PODCAST_LIPSYNC_QUALITY_MODES.map((mode) => PUBLIC_PODCAST_LIPSYNC_QUALITY_PRESETS[mode]);
}

export function getPublicPodcastLipsyncQualityPreset(
  mode: PodcastLipsyncQualityMode = DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE,
): PublicPodcastLipsyncQualityPreset {
  return PUBLIC_PODCAST_LIPSYNC_QUALITY_PRESETS[mode];
}

export function resolvePublicPodcastLipsyncQualitySelection(
  qualityMode: unknown,
): PublicPodcastLipsyncQualitySelection {
  const requestedMode = isPodcastLipsyncQualityMode(qualityMode)
    ? qualityMode
    : DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE;
  const requestedPreset = getPublicPodcastLipsyncQualityPreset(requestedMode);

  if (requestedPreset.status === "available") {
    return { requestedMode, effectiveMode: requestedMode };
  }

  return {
    requestedMode,
    effectiveMode: DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE,
    fallbackNotice: "Using Premium today",
  };
}
