import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/thumbnail
 * Generate a thumbnail from the video (frame extraction + optional title overlay).
 * Body: { title?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : "";

    const supabase = createServiceClient();

    const { data: job } = await supabase
      .from("jobs")
      .select("id, output_url_final, video_url, status, social_exports")
      .eq("id", id)
      .single();

    if (!job || job.status !== "done") {
      return NextResponse.json({ error: "Job not found or not completed" }, { status: 404 });
    }

    const videoUrl = job.output_url_final || job.video_url;
    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL" }, { status: 400 });
    }

    // Check if thumbnail already exists
    const existing = job.social_exports as Record<string, string> | null;
    if (existing?.thumbnail) {
      return NextResponse.json({ thumbnail_url: existing.thumbnail, cached: true });
    }

    // Trigger Modal function via webhook
    const modalUrl = process.env.MODAL_WEBHOOK_URL;
    if (!modalUrl) {
      return NextResponse.json({ error: "Modal not configured" }, { status: 500 });
    }

    // For V1: call webhook with action=thumbnail
    const baseUrl = modalUrl.replace(/\/webhook\/?$/, "").replace(/\/+$/, "");
    const resp = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
      },
      body: JSON.stringify({
        action: "thumbnail",
        job_id: id,
        video_url: videoUrl,
        title,
      }),
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: "Thumbnail generation failed", status: "error" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "processing",
      message: "Thumbnail is being generated. It will appear shortly.",
    });
  } catch (error) {
    console.error("[thumbnail] Error:", error);
    return NextResponse.json({ error: "Thumbnail failed" }, { status: 500 });
  }
}
