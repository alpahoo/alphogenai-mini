import { createLipsync, getLipsyncTask } from "@/lib/heygen-client";

export type PodcastLipsyncProviderId = "heygen";
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

export function getPodcastLipsyncProvider(
  providerId: PodcastLipsyncProviderId = "heygen",
): PodcastLipsyncProvider {
  switch (providerId) {
    case "heygen":
      return heygenPodcastLipsyncProvider;
    default: {
      const exhaustive: never = providerId;
      throw new Error(`Unsupported podcast lip-sync provider: ${exhaustive}`);
    }
  }
}
