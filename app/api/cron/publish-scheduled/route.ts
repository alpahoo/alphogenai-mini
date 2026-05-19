import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { processDueScheduledPosts } from "@/lib/publish-worker";

export const maxDuration = 60; // Allow up to 60s for publishing

/**
 * POST /api/cron/publish-scheduled
 * Called by Vercel Cron every minute.
 * Processes all scheduled posts that are due.
 *
 * Protected by CRON_SECRET header.
 */
export async function POST(req: Request) {
  try {
    // Verify cron secret (Vercel sends this automatically for cron jobs)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const result = await processDueScheduledPosts(supabase);

    console.log(
      `[cron/publish-scheduled] Processed ${result.processed} posts: ` +
      `${result.succeeded} succeeded, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (e) {
    console.error("[cron/publish-scheduled] Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Also support GET for manual testing / Vercel Cron (which uses GET)
export async function GET(req: Request) {
  return POST(req);
}
