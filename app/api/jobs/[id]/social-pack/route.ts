import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateSocialMetadata } from "@/lib/social-metadata";

/**
 * GET /api/jobs/[id]/social-pack
 * Returns a JSON bundle with all social export data:
 *   - Video URLs per format (9:16, 1:1, 16:9)
 *   - Thumbnail URL
 *   - AI-generated metadata (title, hashtags, descriptions)
 *
 * The frontend can use this to render a "Social Pack" card
 * or trigger downloads in one click.
 *
 * Pro/Premium only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Auth required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: job } = await supabase
      .from("jobs")
      .select(
        "id, prompt, plan, engine_used, status, output_url_final, video_url, social_exports, image_url",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.plan === "free") {
      return NextResponse.json(
        { error: "Social Pack requires Pro or Premium plan", upgrade: true },
        { status: 403 },
      );
    }

    if (job.status !== "done") {
      return NextResponse.json(
        { error: "Job not completed" },
        { status: 400 },
      );
    }

    const videoUrl = job.output_url_final || job.video_url;
    const exports = (job.social_exports as Record<string, string>) ?? {};

    // Collect scene thumbnails
    const { data: scenes } = await supabase
      .from("job_scenes")
      .select("scene_index, last_frame_url, clip_url")
      .eq("job_id", id)
      .order("scene_index", { ascending: true });

    const thumbnailCandidates = (scenes ?? [])
      .filter((s) => s.last_frame_url)
      .map((s) => ({
        scene_index: s.scene_index,
        url: s.last_frame_url as string,
      }));

    // Generate metadata (cached response is fast since DeepSeek is already called)
    let metadata = null;
    try {
      metadata = await generateSocialMetadata(
        String(job.prompt),
        job.engine_used ? String(job.engine_used) : undefined,
      );
    } catch {
      // Metadata generation is optional — pack still works without it
    }

    return NextResponse.json({
      pack: {
        job_id: id,
        video_url: videoUrl,
        formats: {
          youtube: exports.youtube || videoUrl,
          tiktok: exports.tiktok || null,
          instagram: exports.instagram || null,
        },
        thumbnail: exports.thumbnail || thumbnailCandidates[0]?.url || job.image_url || null,
        thumbnail_candidates: thumbnailCandidates,
        metadata,
        ready: !!(exports.tiktok && exports.instagram && exports.youtube),
      },
    });
  } catch (error) {
    console.error("[social-pack] Error:", error);
    return NextResponse.json(
      { error: "Failed to build social pack" },
      { status: 500 },
    );
  }
}
