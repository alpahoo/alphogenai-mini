import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { validateScheduledPost } from "@/lib/scheduled-posts";

/**
 * GET /api/scheduled-posts
 * List the current user's scheduled posts, newest first.
 * Optional query params: ?status=scheduled&job_id=xxx
 */
export async function GET(req: Request) {
  try {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const jobIdFilter = url.searchParams.get("job_id");

    const supabase = createServiceClient();
    let query = supabase
      .from("scheduled_posts")
      .select("*, jobs(prompt, output_url_final, video_url, engine_used, plan)")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (jobIdFilter) {
      query = query.eq("job_id", jobIdFilter);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      console.error("[scheduled-posts] List error:", error);
      return NextResponse.json({ error: "Failed to fetch scheduled posts" }, { status: 500 });
    }

    return NextResponse.json({ success: true, posts: data ?? [] });
  } catch (e) {
    console.error("[scheduled-posts] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/scheduled-posts
 * Create a new scheduled post.
 */
export async function POST(req: Request) {
  try {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const validation = validateScheduledPost(body);
    if (!validation.valid || !validation.data) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const d = validation.data;
    const supabase = createServiceClient();

    // Verify the job exists and belongs to the user
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, status, plan, output_url_final, video_url")
      .eq("id", d.job_id)
      .eq("user_id", user.id)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "done") {
      return NextResponse.json(
        { error: "Cannot schedule a post for a job that is not complete" },
        { status: 400 }
      );
    }

    if (!job.output_url_final && !job.video_url) {
      return NextResponse.json(
        { error: "Job has no video output" },
        { status: 400 }
      );
    }

    // Free plan gate — scheduling is pro/premium only
    if (job.plan === "free") {
      return NextResponse.json(
        { error: "Scheduling is available on Pro and Premium plans", upgrade: true },
        { status: 403 }
      );
    }

    // Verify social connections exist for requested platforms
    const { data: connections } = await supabase
      .from("social_connections")
      .select("platform")
      .eq("user_id", user.id);

    const connectedPlatforms = new Set((connections ?? []).map((c) => c.platform));
    const missingPlatforms = d.platforms.filter((p) => !connectedPlatforms.has(p));
    if (missingPlatforms.length > 0) {
      return NextResponse.json(
        { error: `Not connected to: ${missingPlatforms.join(", ")}. Connect first.` },
        { status: 400 }
      );
    }

    // Insert
    const { data: post, error: insertErr } = await supabase
      .from("scheduled_posts")
      .insert({
        user_id: user.id,
        job_id: d.job_id,
        platforms: d.platforms,
        scheduled_at: d.scheduled_at,
        timezone: d.timezone,
        title: d.title ?? null,
        description: d.description ?? null,
        hashtags: d.hashtags ?? [],
        caption_tiktok: d.caption_tiktok ?? null,
        caption_instagram: d.caption_instagram ?? null,
        privacy_youtube: d.privacy_youtube ?? "unlisted",
        privacy_tiktok: d.privacy_tiktok ?? "PUBLIC_TO_EVERYONE",
        thumbnail_url: d.thumbnail_url ?? null,
      })
      .select()
      .single();

    if (insertErr || !post) {
      console.error("[scheduled-posts] Insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create scheduled post" }, { status: 500 });
    }

    console.log(`[scheduled-posts] Created: ${post.id} for job ${d.job_id}, scheduled at ${d.scheduled_at}`);
    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (e) {
    console.error("[scheduled-posts] POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
