import { createLipsync, getLipsyncTask } from "@/lib/heygen-client";

import {
  HEYGEN_ESTIMATED_USD_PER_OUTPUT_SECOND,
  LATENTSYNC_MEASURED_USD_PER_OUTPUT_SECOND,
  LATENTSYNC_MAX_CONCURRENT_JOBS,
  LATENTSYNC_MAX_INPUT_SECONDS,
} from "@/lib/podcast/lipsync-provider-metrics";

export type PodcastLipsyncProviderId = "heygen" | "latentsync_modal";
export type PodcastLipsyncMode = "speed" | "precision";

export interface PodcastLipsyncCreateInput {
  videoUrl: string;
  audioUrl: string;
  mode: PodcastLipsyncMode;
}

export interface PodcastLipsyncCreateResult {
  providerTaskId: string;
}

export type PodcastLipsyncTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface PodcastLipsyncPollResult {
  status: PodcastLipsyncTaskStatus;
  videoUrl?: string;
  error?: string;
  metrics?: {
    elapsedSeconds?: number;
    outputDurationSeconds?: number;
    gpu?: string;
  };
}

export interface PodcastLipsyncProviderCapabilities {
  maxInputSeconds?: number;
  maxConcurrentJobs?: number;
  estimatedUsdPerOutputSecond: number;
}

export interface PodcastLipsyncProvider {
  id: PodcastLipsyncProviderId;
  label: string;
  capabilities: PodcastLipsyncProviderCapabilities;
  createClip(input: PodcastLipsyncCreateInput): Promise<PodcastLipsyncCreateResult>;
  pollClip(providerTaskId: string): Promise<PodcastLipsyncPollResult>;
}

function latentSyncBaseUrl(): string {
  const raw = process.env.MODAL_LATENTSYNC_URL;
  if (!raw) throw new Error("MODAL_LATENTSYNC_URL not configured");
  return raw.replace(/\/+$/, "");
}

function latentSyncHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-webhook-secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
  };
}

export const heygenPodcastLipsyncProvider: PodcastLipsyncProvider = {
  id: "heygen",
  label: "HeyGen",
  capabilities: { estimatedUsdPerOutputSecond: HEYGEN_ESTIMATED_USD_PER_OUTPUT_SECOND },
  async createClip(input) {
    const providerTaskId = await createLipsync(input.videoUrl, input.audioUrl, input.mode);
    return { providerTaskId };
  },
  async pollClip(providerTaskId) {
    return getLipsyncTask(providerTaskId);
  },
};

export const latentSyncModalPodcastLipsyncProvider: PodcastLipsyncProvider = {
  id: "latentsync_modal",
  label: "LatentSync on Modal",
  capabilities: {
    maxInputSeconds: LATENTSYNC_MAX_INPUT_SECONDS,
    maxConcurrentJobs: LATENTSYNC_MAX_CONCURRENT_JOBS,
    estimatedUsdPerOutputSecond: LATENTSYNC_MEASURED_USD_PER_OUTPUT_SECOND,
  },
  async createClip(input) {
    const response = await fetch(`${latentSyncBaseUrl()}/start`, {
      method: "POST",
      headers: latentSyncHeaders(),
      body: JSON.stringify({
        video_url: input.videoUrl,
        audio_url: input.audioUrl,
        max_seconds: LATENTSYNC_MAX_INPUT_SECONDS,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`Modal LatentSync start ${response.status}: ${detail.slice(0, 200)}`);
    }
    const payload = await response.json().catch(() => null) as { call_id?: unknown } | null;
    if (typeof payload?.call_id !== "string" || !payload.call_id) {
      throw new Error("Modal LatentSync start returned no call_id");
    }
    return { providerTaskId: payload.call_id };
  },
  async pollClip(providerTaskId) {
    const response = await fetch(
      `${latentSyncBaseUrl()}/status?call_id=${encodeURIComponent(providerTaskId)}`,
      {
        method: "GET",
        headers: latentSyncHeaders(),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status === 202) return { status: "processing" };
    const payload = await response.json().catch(() => null) as {
      status?: unknown;
      output_url?: unknown;
      error?: unknown;
      elapsed_seconds?: unknown;
      output_probe?: { duration_seconds?: unknown } | null;
      gpu?: unknown;
    } | null;
    if (!response.ok || payload?.status === "failed") {
      return {
        status: "failed",
        error: typeof payload?.error === "string" ? payload.error : `Modal LatentSync poll ${response.status}`,
      };
    }
    if (payload?.status === "completed" && typeof payload.output_url === "string") {
      const metrics = {
        elapsedSeconds: typeof payload.elapsed_seconds === "number" ? payload.elapsed_seconds : undefined,
        outputDurationSeconds: typeof payload.output_probe?.duration_seconds === "number"
          ? payload.output_probe.duration_seconds
          : undefined,
        gpu: typeof payload.gpu === "string" ? payload.gpu : undefined,
      };
      const hasMetrics = Object.values(metrics).some((value) => value !== undefined);
      return {
        status: "completed",
        videoUrl: payload.output_url,
        ...(hasMetrics ? { metrics } : {}),
      };
    }
    return { status: "processing" };
  },
};

export function isPodcastLipsyncProviderId(value: unknown): value is PodcastLipsyncProviderId {
  return value === "heygen" || value === "latentsync_modal";
}

export function getPodcastLipsyncProvider(
  providerId: PodcastLipsyncProviderId = "heygen",
): PodcastLipsyncProvider {
  switch (providerId) {
    case "heygen":
      return heygenPodcastLipsyncProvider;
    case "latentsync_modal":
      return latentSyncModalPodcastLipsyncProvider;
    default: {
      const exhaustive: never = providerId;
      throw new Error(`Unsupported podcast lip-sync provider: ${exhaustive}`);
    }
  }
}

export function providerSupportsInputSeconds(
  provider: PodcastLipsyncProvider,
  inputSeconds: number,
): boolean {
  if (!(inputSeconds > 0)) return false;
  const max = provider.capabilities.maxInputSeconds;
  return max == null || inputSeconds <= max;
}

export function estimateProviderLipsyncUsd(
  provider: PodcastLipsyncProvider,
  outputSeconds: number,
): number {
  if (!(outputSeconds > 0)) return 0;
  return outputSeconds * provider.capabilities.estimatedUsdPerOutputSecond;
}
