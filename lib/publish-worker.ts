/**
 * Publish Worker — executes scheduled posts by calling existing publish API routes.
 *
 * Instead of duplicating the YouTube/TikTok/Instagram publish logic,
 * we call the existing /api/jobs/[id]/publish/[platform] routes internally.
 * This ensures token refresh, error handling, and upload logic stay in one place.
 *
 * The worker is invoked by:
 *  1. POST /api/scheduled-posts/[id]/publish-now (manual)
 *  2. POST /api/cron/publish-scheduled (automated cron)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SchedulePlatform } from "./scheduled-posts";

interface ScheduledPostRow {
  id: string;
  user_id: string;
  job_id: string;
  platforms: SchedulePlatform[];
  title: string | null;
  description: string | null;
  hashtags: string[];
  caption_tiktok: string | null;
  caption_instagram: string | null;
  privacy_youtube: string;
  privacy_tiktok: string;
  status: string;
  retry_count: number;
  max_retries: number;
}

interface PlatformResult {
  success: boolean;
  url?: string;
  error?: string;
  published_at?: string;
}

interface PublishOutcome {
  status: "published" | "partially_published" | "failed";
  publish_results: Record<string, PlatformResult>;
  error_message: string | null;
}

// Base URL for internal API calls
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Publish a scheduled post to all its target platforms.
 * Updates the DB row with results.
 */
export async function publishScheduledPost(
  post: ScheduledPostRow,
  supabase: SupabaseClient,
): Promise<PublishOutcome> {
  // Mark as publishing
  await supabase
    .from("scheduled_posts")
    .update({ status: "publishing" })
    .eq("id", post.id);

  const results: Record<string, PlatformResult> = {};
  let successCount = 0;
  let failCount = 0;

  for (const platform of post.platforms) {
    try {
      const result = await publishToPlatform(post, platform, supabase);
      results[platform] = result;
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      results[platform] = { success: false, error: errorMsg };
      failCount++;
    }
  }

  // Determine final status
  let status: PublishOutcome["status"];
  let errorMessage: string | null = null;

  if (successCount === post.platforms.length) {
    status = "published";
  } else if (successCount > 0) {
    status = "partially_published";
    const failedPlatforms = Object.entries(results)
      .filter(([, r]) => !r.success)
      .map(([p, r]) => `${p}: ${r.error}`)
      .join("; ");
    errorMessage = `Some platforms failed: ${failedPlatforms}`;
  } else {
    status = "failed";
    errorMessage = Object.entries(results)
      .map(([p, r]) => `${p}: ${r.error}`)
      .join("; ");
  }

  // Update DB
  await supabase
    .from("scheduled_posts")
    .update({
      status,
      publish_results: results,
      error_message: errorMessage,
      published_at: successCount > 0 ? new Date().toISOString() : null,
      retry_count: post.retry_count + (status === "failed" ? 1 : 0),
    })
    .eq("id", post.id);

  console.log(
    `[publish-worker] Post ${post.id}: ${status} (${successCount}/${post.platforms.length} platforms)`
  );

  return { status, publish_results: results, error_message: errorMessage };
}

/**
 * Publish to a single platform by calling the existing internal API.
 */
async function publishToPlatform(
  post: ScheduledPostRow,
  platform: SchedulePlatform,
  supabase: SupabaseClient,
): Promise<PlatformResult> {
  // Get the job's video URL
  const { data: job } = await supabase
    .from("jobs")
    .select("output_url_final, video_url, social_exports")
    .eq("id", post.job_id)
    .single();

  if (!job) {
    return { success: false, error: "Job not found" };
  }

  // Get user's auth token for internal API call
  const { data: connection } = await supabase
    .from("social_connections")
    .select("platform")
    .eq("user_id", post.user_id)
    .eq("platform", platform)
    .single();

  if (!connection) {
    return { success: false, error: `${platform} not connected` };
  }

  // Build platform-specific request body
  let body: Record<string, unknown>;

  switch (platform) {
    case "youtube":
      body = {
        title: post.title || "Untitled Video",
        description: post.description || "",
        tags: post.hashtags.map((h) => h.replace("#", "")),
        privacy: post.privacy_youtube || "unlisted",
      };
      break;
    case "tiktok":
      body = {
        title: post.caption_tiktok || post.title || "",
        privacy: post.privacy_tiktok || "PUBLIC_TO_EVERYONE",
      };
      break;
    case "instagram":
      body = {
        caption: post.caption_instagram || post.title || "",
      };
      break;
  }

  // Call the internal publish API
  // We use the service-level approach: directly invoke the publish logic
  // by calling the API with a special header that the cron worker uses
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/jobs/${post.job_id}/publish/${platform}`;

  console.log(`[publish-worker] Publishing to ${platform}: ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Pass the user_id so the publish route can authenticate on behalf
      "X-Cron-Secret": process.env.CRON_SECRET || "",
      "X-Schedule-User-Id": post.user_id,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 2 min timeout per platform
  });

  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (data.success) {
    return {
      success: true,
      url: data.youtube_url || data.url || undefined,
      published_at: new Date().toISOString(),
    };
  }

  return {
    success: false,
    error: data.error || `HTTP ${res.status}`,
  };
}

/**
 * Process all due scheduled posts.
 * Called by the cron endpoint.
 */
export async function processDueScheduledPosts(
  supabase: SupabaseClient,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  // Find posts that are due
  const { data: duePosts, error } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10); // Process max 10 per cron tick

  if (error) {
    console.error("[publish-worker] Failed to query due posts:", error);
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  if (!duePosts || duePosts.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  console.log(`[publish-worker] Found ${duePosts.length} due post(s)`);

  let succeeded = 0;
  let failed = 0;

  for (const post of duePosts) {
    // Skip if max retries exceeded
    if (post.retry_count >= post.max_retries) {
      await supabase
        .from("scheduled_posts")
        .update({
          status: "failed",
          error_message: "Max retries exceeded",
        })
        .eq("id", post.id);
      failed++;
      continue;
    }

    const result = await publishScheduledPost(post, supabase);
    if (result.status === "published") {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { processed: duePosts.length, succeeded, failed };
}
