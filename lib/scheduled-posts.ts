/**
 * Scheduled Posts — types & helpers for Postiz-like scheduling system.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduledPostStatus =
  | "scheduled"
  | "publishing"
  | "published"
  | "partially_published"
  | "failed"
  | "cancelled";

export type SchedulePlatform = "youtube" | "tiktok" | "instagram";

export interface PlatformPublishResult {
  success: boolean;
  url?: string;
  error?: string;
  published_at?: string;
}

export interface ScheduledPost {
  id: string;
  user_id: string;
  job_id: string;
  platforms: SchedulePlatform[];
  title: string | null;
  description: string | null;
  hashtags: string[];
  caption_tiktok: string | null;
  caption_instagram: string | null;
  privacy_youtube: "public" | "unlisted" | "private";
  privacy_tiktok: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  thumbnail_url: string | null;
  scheduled_at: string; // ISO 8601
  timezone: string;
  status: ScheduledPostStatus;
  publish_results: Record<string, PlatformPublishResult>;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledPostRequest {
  job_id: string;
  platforms: SchedulePlatform[];
  scheduled_at: string; // ISO 8601
  timezone?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  caption_tiktok?: string;
  caption_instagram?: string;
  privacy_youtube?: "public" | "unlisted" | "private";
  privacy_tiktok?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  thumbnail_url?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_PLATFORMS: ReadonlySet<string> = new Set(["youtube", "tiktok", "instagram"]);

export function validateScheduledPost(body: unknown): {
  valid: boolean;
  error?: string;
  data?: CreateScheduledPostRequest;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body is required" };
  }

  const b = body as Record<string, unknown>;

  // job_id
  if (!b.job_id || typeof b.job_id !== "string") {
    return { valid: false, error: "job_id is required" };
  }

  // platforms
  if (!Array.isArray(b.platforms) || b.platforms.length === 0) {
    return { valid: false, error: "At least one platform is required" };
  }
  for (const p of b.platforms) {
    if (!VALID_PLATFORMS.has(p)) {
      return { valid: false, error: `Invalid platform: ${p}` };
    }
  }

  // scheduled_at
  if (!b.scheduled_at || typeof b.scheduled_at !== "string") {
    return { valid: false, error: "scheduled_at is required (ISO 8601)" };
  }
  const scheduledDate = new Date(b.scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return { valid: false, error: "scheduled_at is not a valid date" };
  }
  // Must be at least 2 minutes in the future
  if (scheduledDate.getTime() < Date.now() + 2 * 60_000) {
    return { valid: false, error: "scheduled_at must be at least 2 minutes in the future" };
  }

  // title
  if (b.title !== undefined && typeof b.title === "string" && b.title.length > 200) {
    return { valid: false, error: "Title must be 200 characters or less" };
  }

  return {
    valid: true,
    data: {
      job_id: b.job_id as string,
      platforms: b.platforms as SchedulePlatform[],
      scheduled_at: scheduledDate.toISOString(),
      timezone: (typeof b.timezone === "string" ? b.timezone : "UTC"),
      title: typeof b.title === "string" ? b.title : undefined,
      description: typeof b.description === "string" ? b.description : undefined,
      hashtags: Array.isArray(b.hashtags) ? b.hashtags.filter((h): h is string => typeof h === "string") : undefined,
      caption_tiktok: typeof b.caption_tiktok === "string" ? b.caption_tiktok : undefined,
      caption_instagram: typeof b.caption_instagram === "string" ? b.caption_instagram : undefined,
      privacy_youtube: typeof b.privacy_youtube === "string" ? b.privacy_youtube as "public" | "unlisted" | "private" : undefined,
      privacy_tiktok: typeof b.privacy_tiktok === "string" ? b.privacy_tiktok as "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY" : undefined,
      thumbnail_url: typeof b.thumbnail_url === "string" ? b.thumbnail_url : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<ScheduledPostStatus, string> = {
  scheduled: "Scheduled",
  publishing: "Publishing...",
  published: "Published",
  partially_published: "Partially published",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const STATUS_COLORS: Record<ScheduledPostStatus, string> = {
  scheduled: "text-blue-400",
  publishing: "text-amber-400",
  published: "text-green-400",
  partially_published: "text-amber-400",
  failed: "text-red-400",
  cancelled: "text-muted-foreground",
};
