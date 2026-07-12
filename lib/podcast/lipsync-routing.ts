import type { PodcastLipsyncMode, PodcastLipsyncProviderId } from "./lipsync-provider";
import {
  DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE,
  getPublicPodcastLipsyncQualityPreset,
  isPodcastLipsyncQualityMode,
  PODCAST_LIPSYNC_QUALITY_MODES,
  type PodcastLipsyncQualityMode,
  type PodcastLipsyncQualityStatus,
} from "./lipsync-quality";

export {
  DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE,
  isPodcastLipsyncQualityMode,
  PODCAST_LIPSYNC_QUALITY_MODES,
  type PodcastLipsyncQualityMode,
  type PodcastLipsyncQualityStatus,
} from "./lipsync-quality";

export interface PodcastLipsyncQualityPreset {
  id: PodcastLipsyncQualityMode;
  providerId: PodcastLipsyncProviderId;
  providerMode: PodcastLipsyncMode;
  internalNote: string;
}

export interface PodcastLipsyncRoutingPlan extends PodcastLipsyncQualityPreset {
  status: PodcastLipsyncQualityStatus;
  requestedQualityMode: PodcastLipsyncQualityMode;
  effectiveQualityMode: PodcastLipsyncQualityMode;
  fallbackReason?: string;
}

export const PODCAST_LIPSYNC_QUALITY_PRESETS = {
  economy: {
    id: "economy",
    providerId: "heygen",
    providerMode: "speed",
    internalNote: "Reserved for self-hosted or lower-cost providers after benchmark hardening.",
  },
  balanced: {
    id: "balanced",
    providerId: "latentsync_modal",
    providerMode: "precision",
    internalNote: "LatentSync on Modal behind a server-side feature flag, with HeyGen fallback.",
  },
  premium: {
    id: "premium",
    providerId: "heygen",
    providerMode: "precision",
    internalNote: "Current production baseline from T-1144b QA.",
  },
  cinema: {
    id: "cinema",
    providerId: "heygen",
    providerMode: "precision",
    internalNote: "Reserved for Runway/Act-Two or equivalent once benchmarked and cost-gated.",
  },
} satisfies Record<PodcastLipsyncQualityMode, PodcastLipsyncQualityPreset>;

export function listPodcastLipsyncQualityPresets(): PodcastLipsyncQualityPreset[] {
  return PODCAST_LIPSYNC_QUALITY_MODES.map((mode) => PODCAST_LIPSYNC_QUALITY_PRESETS[mode]);
}

export function getPodcastLipsyncQualityPreset(
  mode: PodcastLipsyncQualityMode = DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE,
): PodcastLipsyncQualityPreset {
  return PODCAST_LIPSYNC_QUALITY_PRESETS[mode];
}

export function isLatentSyncBalancedEnabled(): boolean {
  return process.env.PODCAST_LATENTSYNC_BALANCED_ENABLED === "true" &&
    Boolean(process.env.MODAL_LATENTSYNC_URL);
}

export function resolvePodcastLipsyncRoutingPlan(options?: {
  qualityMode?: unknown;
  allowPlanned?: boolean;
  balancedCohortEligible?: boolean;
}): PodcastLipsyncRoutingPlan {
  const requestedQualityMode = isPodcastLipsyncQualityMode(options?.qualityMode)
    ? options.qualityMode
    : DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE;
  const requestedPreset = getPodcastLipsyncQualityPreset(requestedQualityMode);
  const requestedStatus = getPublicPodcastLipsyncQualityPreset(requestedQualityMode).status;
  const balancedEnabled = requestedQualityMode === "balanced"
    && options?.balancedCohortEligible === true
    && isLatentSyncBalancedEnabled();

  if (requestedStatus === "available" || balancedEnabled || options?.allowPlanned) {
    return {
      ...requestedPreset,
      status: balancedEnabled ? "available" : requestedStatus,
      requestedQualityMode,
      effectiveQualityMode: requestedQualityMode,
    };
  }

  const fallbackPreset = getPodcastLipsyncQualityPreset(DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE);
  const fallbackStatus = getPublicPodcastLipsyncQualityPreset(DEFAULT_PODCAST_LIPSYNC_QUALITY_MODE).status;

  return {
    ...fallbackPreset,
    status: fallbackStatus,
    requestedQualityMode,
    effectiveQualityMode: fallbackPreset.id,
    fallbackReason: `${requestedQualityMode} is not production-routed yet`,
  };
}
