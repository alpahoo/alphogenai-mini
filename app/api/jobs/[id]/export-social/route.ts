import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/export-social
 * Returns multi-format video export URLs (9:16 TikTok, 1:1 Instagram, 16:9 YouTube).
 * Pro/Premium only.
 *
 * V1 strategy:
 *   - YouTube (16:9): original video (already 16:9 from all generators)
 *   - TikTok (9:16) + Instagram (1:1): original video for now
 *     (users crop in-app). Future: ffmpeg reformat via Modal.
 *   - If MODAL_WEBHOOK_URL is configured, attempts async multi-format
 *     processing. Otherwise gracefully falls back to original URLs.
 *
 * Results are cached in the `social_exports` JSONB column.
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

    // Get job with ownership check
    const { data: job } = await supabase
      .from("jobs")
      .select("id, user_id, plan, output_url_final, video_url, status, social_exports")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Plan gate
    if (job.plan === "free") {
      return NextResponse.json(
        { error: "Social export is available for Pro and Premium plans", upgrade: true },
        { status: 403 }
      );
    }

    if (job.status !== "done") {
      return NextResponse.json({ error: "Job not completed yet" }, { status: 400 });
    }

    // Return cached exports if already processed
    if (job.social_exports && Object.keys(job.social_exports).length > 0) {
      return NextResponse.json({ formats: job.social_exports, cached: true });
    }

    const videoUrl = job.output_url_final || job.video_url;
    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL available" }, { status: 400 });
    }

    // Attempt Modal-based ffmpeg reformatting if configured
    const modalUrl = process.env.MODAL_WEBHOOK_URL;
    if (modalUrl) {
      try {
        const baseUrl = modalUrl.replace(/\/webhook\/?$/, "").replace(/\/+$/, "");
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

        if (resp.ok) {
          // Modal accepted the job — it will update social_exports via webhook
          return NextResponse.json({
            status: "processing",
            message: "Social export started. Formats will appear in 1-2 minutes.",
            formats: { youtube: videoUrl }, // YouTube is always ready (16:9 original)
          });
        }
        console.warn(`[export-social] Modal returned ${resp.status}, using fallback`);
      } catch (e) {
        console.warn("[export-social] Modal call failed, using fallback:", e instanceof Error ? e.message : e);
      }
    }

    // V1 fallback: use original video for all formats
    // YouTube is native 16:9. TikTok/Instagram users will crop in their app.
    const formats = {
      tiktok: videoUrl,
      instagram: videoUrl,
      youtube: videoUrl,
    };

    // Persist so next call returns instantly
    await supabase.from("jobs").update({ social_exports: formats }).eq("id", id);

    console.log(`[export-social] job=${id} formats cached (V1 fallback — original URL)`);

    return NextResponse.json({ formats });
  } catch (error) {
    console.error("[export-social] Error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
