import { isAdminEmail } from "@/lib/flags";

export const BALANCED_BETA_MAX_CONCURRENT_CLIPS = 2;
export const BALANCED_BETA_SECONDS_PER_WAVE = 220;

function betaEmails(): string[] {
  return (process.env.PODCAST_BALANCED_BETA_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPodcastBalancedBetaEligible(options: {
  email?: string | null;
  plan?: string | null;
}): boolean {
  const email = options.email?.trim().toLowerCase();
  if (!email) return false;
  if (isAdminEmail(email)) return true;
  return options.plan === "premium" && betaEmails().includes(email);
}

export function estimateBalancedBetaQueueSeconds(clipCount: number): number {
  if (!Number.isFinite(clipCount) || clipCount <= 0) return 0;
  return Math.ceil(clipCount / BALANCED_BETA_MAX_CONCURRENT_CLIPS)
    * BALANCED_BETA_SECONDS_PER_WAVE;
}

export function formatBalancedBetaEta(clipCount: number): string {
  const seconds = estimateBalancedBetaQueueSeconds(clipCount);
  if (seconds <= 0) return "Ready";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `About ${minutes} min`;
}
