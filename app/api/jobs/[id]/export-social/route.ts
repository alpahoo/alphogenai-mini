import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/export-social
 * Triggers multi-format video export (9:16 TikTok, 1:1 Instagram, 16:9 YouTube).
 * Pro/Premium only.
 *
 * Strategy:
 *   - If Modal is configured, spawns async ffmpeg reformat (crop/pad).
 *     Modal writes results to social_exports when done.
 *   - If Modal is unavailable, falls back to original URL for all formats.
 *   - Results are cached in the `social_exports` JSONB column.
 *
 * GET /api/jobs/[id]/export-social
 * Poll for export status (used by frontend while Modal is processing).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: job } = await supabase
      .from("jobs")
      .select("id, social_exports")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const exports = job.social_exports as Record<string, string> | null;

    // Check if Modal has finished (all 3 format URLs present, not just a processing sentinel)
    if (exports && exports.tiktok && exports.instagram && exports.youtube && !exports._processing) {
      return NextResponse.json({ formats: exports, cached: true, ready: true });
    }

    // Still processing or not started
    return NextResponse.json({ ready: false, formats: exports ?? {} });
  } catch (error) {
    console.error("[export-social GET] Error:", error);
    return NextResponse.json({ error: "Failed to check export status" }, { status: 500 });
  }
}

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

    // Return cached exports if already processed (all 3 formats present)
    const existing = job.social_exports as Record<string, string> | null;
    if (existing && existing.tiktok && existing.instagram && existing.youtube && !existing._processing) {
      return NextResponse.json({ formats: existing, cached: true });
    }

    // If already processing, don't re-trigger
    if (existing?._processing) {
      return NextResponse.json({
        status: "processing",
        message: "Export is in progress. Check back in a moment.",
        formats: { youtube: job.output_url_final || job.video_url },
      });
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
        const resp = await fetch(`${baseUrl}/export-social`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
          },
          body: JSON.stringify({
            job_id: id,
            video_url: videoUrl,
          }),
        });

        if (resp.ok) {
          // Mark as processing so we don't re-trigger on poll
          await supabase.from("jobs").update({
            social_exports: { _processing: true, youtube: videoUrl },
          }).eq("id", id);

          return NextResponse.json({
            status: "processing",
            message: "Social export started. Formats will appear in 1-2 minutes.",
            formats: { youtube: videoUrl },
          });
        }
        console.warn(`[export-social] Modal returned ${resp.status}, using fallback`);
      } catch (e) {
        console.warn("[export-social] Modal call failed, using fallback:", e instanceof Error ? e.message : e);
      }
    }

    // Fallback: use original video for all formats
    // YouTube is native 16:9. TikTok/Instagram users crop in-app.
    const formats = {
      tiktok: videoUrl,
      instagram: videoUrl,
      youtube: videoUrl,
    };

    await supabase.from("jobs").update({ social_exports: formats }).eq("id", id);
    console.log(`[export-social] job=${id} formats cached (fallback — original URL)`);

    return NextResponse.json({ formats });
  } catch (error) {
    console.error("[export-social] Error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
