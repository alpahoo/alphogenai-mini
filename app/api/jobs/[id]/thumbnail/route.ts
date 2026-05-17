import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * POST /api/jobs/[id]/thumbnail
 * Generate or retrieve a thumbnail for the completed video.
 *
 * Resolution order (first hit wins):
 *   1. Cached thumbnail in social_exports.thumbnail
 *   2. First scene's last_frame_url (already extracted by the pipeline)
 *   3. User-provided image_url (I2V first frame)
 *   4. R2 frame file (frames/{job_id}_scene_00_last.jpg)
 *   5. Modal webhook (frame extraction via GPU — only if configured)
 *
 * V1 fallback: steps 2–4 cover most cases without needing Modal.
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
      .select("id, output_url_final, video_url, image_url, status, social_exports")
      .eq("id", id)
      .single();

    if (!job || job.status !== "done") {
      return NextResponse.json({ error: "Job not found or not completed" }, { status: 404 });
    }

    const videoUrl = job.output_url_final || job.video_url;
    if (!videoUrl) {
      return NextResponse.json({ error: "No video URL" }, { status: 400 });
    }

    // 1. Check if thumbnail already cached
    const existing = job.social_exports as Record<string, string> | null;
    if (existing?.thumbnail) {
      return NextResponse.json({ thumbnail_url: existing.thumbnail, cached: true });
    }

    // ── V1 Fallback: find a thumbnail without Modal ─────────────────────
    let thumbnailUrl: string | null = null;

    // 2. First scene's last_frame_url (extracted during multi-scene pipeline)
    if (!thumbnailUrl) {
      const { data: firstScene } = await supabase
        .from("job_scenes")
        .select("last_frame_url")
        .eq("job_id", id)
        .eq("scene_index", 0)
        .single();

      if (firstScene?.last_frame_url) {
        thumbnailUrl = firstScene.last_frame_url;
      }
    }

    // 3. User-provided image_url (I2V first frame)
    if (!thumbnailUrl && job.image_url) {
      thumbnailUrl = job.image_url as string;
    }

    // 4. R2 frame file (check if it exists via public URL)
    if (!thumbnailUrl && process.env.R2_PUBLIC_URL) {
      const r2FrameUrl = `${process.env.R2_PUBLIC_URL.replace(/\/+$/, "")}/frames/${id}_scene_00_last.jpg`;
      try {
        const probe = await fetch(r2FrameUrl, { method: "HEAD" });
        if (probe.ok) {
          thumbnailUrl = r2FrameUrl;
        }
      } catch {
        // R2 unreachable — skip silently
      }
    }

    // If we found a thumbnail via fallback, cache it and return
    if (thumbnailUrl) {
      const updatedExports = { ...(existing ?? {}), thumbnail: thumbnailUrl };
      await supabase
        .from("jobs")
        .update({ social_exports: updatedExports })
        .eq("id", id);

      return NextResponse.json({ thumbnail_url: thumbnailUrl, cached: false });
    }

    // 5. Modal webhook (GPU frame extraction — only if configured)
    const modalUrl = process.env.MODAL_WEBHOOK_URL;
    if (!modalUrl) {
      return NextResponse.json(
        { error: "No thumbnail available. Try again after a scene completes." },
        { status: 404 }
      );
    }

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
