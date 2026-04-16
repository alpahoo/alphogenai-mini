import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/export-social
 * Triggers multi-format video export (9:16 TikTok, 1:1 Instagram, 16:9 YouTube).
 * Pro/Premium only.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth check
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Check plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (!profile || profile.plan === "free") {
      return NextResponse.json(
        { error: "Social export is available for Pro and Premium plans", upgrade: true },
        { status: 403 }
      );
    }

    // Get job
    const { data: job } = await supabase
      .from("jobs")
      .select("id, output_url_final, video_url, status, social_exports")
      .eq("id", id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "done") {
      return NextResponse.json({ error: "Job not completed yet" }, { status: 400 });
    }

    // Check if already exported
    if (job.social_exports && Object.keys(job.social_exports).length > 0) {
      return NextResponse.json({ formats: job.social_exports, cached: true });
    }

    const videoUrl = job.output_url_final || job.video_url;
    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL" }, { status: 400 });
    }

    // Trigger Modal function
    const modalUrl = process.env.MODAL_WEBHOOK_URL;
    if (!modalUrl) {
      return NextResponse.json({ error: "Modal not configured" }, { status: 500 });
    }

    // Call export_social_formats via Modal webhook
    // Since it's a modal.function not a web endpoint, we spawn it async
    // and the results get stored in job.social_exports via update_job()
    const baseUrl = modalUrl.replace(/\/webhook\/?$/, "").replace(/\/+$/, "");
    // For V1, we call the webhook with a special action
    const resp = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
      },
      body: JSON.stringify({
        action: "export_social",
        job_id: id,
        video_url: videoUrl,
      }),
    });

    if (!resp.ok) {
      // Fallback: just return the original URL for all formats
      const fallback = {
        tiktok: videoUrl,
        instagram: videoUrl,
        youtube: videoUrl,
      };
      await supabase.from("jobs").update({ social_exports: fallback }).eq("id", id);
      return NextResponse.json({ formats: fallback, note: "Using original format (export pending)" });
    }

    return NextResponse.json({
      status: "processing",
      message: "Social export started. Formats will appear on the job page in 1-2 minutes.",
    });
  } catch (error) {
    console.error("[export-social] Error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
