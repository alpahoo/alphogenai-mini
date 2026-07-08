import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { triggerRenderPodcast } from "@/lib/modal-client";

function getPodcastRenderMode(podcast: { metadata?: unknown }): "static" | "talking_visual" | "lipsync_premium" {
  const metadata = podcast.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "talking_visual";
  const mode = (metadata as { render_mode?: unknown }).render_mode;
  return mode === "static" || mode === "lipsync_premium" ? mode : "talking_visual";
}
/**
 * POST /api/podcasts/[id]/render
 * Explicitly render a two-shot voice-first podcast MP4 (T-1131e). Never auto-run.
 * Validates ownership + readiness, marks render_status='rendering', then triggers
 * the Modal render (fire-and-forget). Modal writes podcasts.video_url +
 * render_status='done' (or 'failed'); the client polls GET /api/podcasts/[id].
 *
 * No lip-sync, no GPU, no credit charge in this ticket.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const service = createServiceClient();

    const { data: podcast } = await service.from("podcasts").select("*").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // V1 supports only two_shot — never silently render a different layout.
    if (podcast.layout !== "two_shot") {
      return NextResponse.json(
        { error: "Only the two-shot layout can be rendered yet" },
        { status: 400 },
      );
    }

    if (podcast.render_status === "rendering") {
      return NextResponse.json({ error: "A render is already in progress" }, { status: 409 });
    }

    const { data: segments } = await service
      .from("podcast_segments")
      .select("id, status, audio_url")
      .eq("podcast_id", id);

    if (!segments || segments.length === 0) {
      return NextResponse.json({ error: "This podcast has no dialogue segments yet" }, { status: 400 });
    }
    const allReady = segments.every((s) => s.status === "ready" && !!s.audio_url);
    if (!allReady) {
      return NextResponse.json(
        { error: "Generate voice-over for all segments before rendering." },
        { status: 400 },
      );
    }

    const renderMode = getPodcastRenderMode(podcast);
    if (renderMode === "lipsync_premium") {
      const { data: clips, error: clipsErr } = await service
        .from("podcast_segment_lipsync_clips")
        .select("segment_id,audio_url,status,video_url,updated_at")
        .eq("podcast_id", id);
      if (clipsErr) {
        console.error("[podcasts/render] could not verify premium clips:", clipsErr);
        return NextResponse.json({ error: "Could not verify premium lip-sync clips." }, { status: 500 });
      }
      const hasReadyClipForCurrentAudio = (segment: { id: string; audio_url: string | null }) => (clips || [])
        .filter((clip) => clip.segment_id === segment.id && clip.audio_url === segment.audio_url)
        .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
        .some((clip) => clip.status === "ready" && !!clip.video_url);
      const premiumReady = segments.every((segment) => hasReadyClipForCurrentAudio(segment));
      if (!premiumReady) {
        return NextResponse.json(
          { error: "Generate all premium lip-sync clips before rendering the premium video." },
          { status: 400 },
        );
      }
    }

    // Mark rendering before triggering so the UI/poll reflects it immediately.
    // If this DB write fails, do NOT trigger the render (the state would be wrong).
    const { error: markErr } = await service
      .from("podcasts")
      .update({ render_status: "rendering", render_error: null })
      .eq("id", id);
    if (markErr) {
      console.error("[podcasts/render] could not mark rendering:", markErr);
      return NextResponse.json({ error: "Could not start the render" }, { status: 500 });
    }

    try {
      await triggerRenderPodcast(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start the render";
      await service.from("podcasts").update({ render_status: "failed", render_error: msg.slice(0, 2000) }).eq("id", id);
      console.error("[podcasts/render] trigger failed:", msg);
      return NextResponse.json({ error: "Could not start the render" }, { status: 502 });
    }

    return NextResponse.json({ status: "rendering" }, { status: 202 });
  } catch (err) {
    console.error("POST /api/podcasts/[id]/render:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
