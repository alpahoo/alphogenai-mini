import { createLipsync, getLipsyncTask } from "@/lib/heygen-client";

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
}

export interface PodcastLipsyncProvider {
  id: PodcastLipsyncProviderId;
  label: string;
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
  async createClip(input) {
    const response = await fetch(`${latentSyncBaseUrl()}/start`, {
      method: "POST",
      headers: latentSyncHeaders(),
      body: JSON.stringify({
        video_url: input.videoUrl,
        audio_url: input.audioUrl,
        max_seconds: 8,
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
    } | null;
    if (!response.ok || payload?.status === "failed") {
      return {
        status: "failed",
        error: typeof payload?.error === "string" ? payload.error : `Modal LatentSync poll ${response.status}`,
      };
    }
    if (payload?.status === "completed" && typeof payload.output_url === "string") {
      return { status: "completed", videoUrl: payload.output_url };
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
