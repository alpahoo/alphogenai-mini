import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";

const SEGMENT_TEXT_MAX = 600;

/**
 * PATCH /api/podcasts/[id]/segments/[segmentId]
 * Edit one dialogue line. This invalidates the rendered MP4 and clears only
 * that segment's generated audio, so users can regenerate voices without
 * rewriting the entire podcast.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, segmentId } = await params;
    const service = createServiceClient();

    const { data: podcast } = await service
      .from("podcasts")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim().replace(/\s+/g, " ") : "";
    if (!text || text.length > SEGMENT_TEXT_MAX) {
      return NextResponse.json(
        { error: `text must be 1..${SEGMENT_TEXT_MAX} chars` },
        { status: 400 },
      );
    }

    const { data: existing } = await service
      .from("podcast_segments")
      .select("*")
      .eq("id", segmentId)
      .eq("podcast_id", id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }

    if (existing.text === text) {
      return NextResponse.json({ segment: existing, unchanged: true });
    }

    // Clear stale render BEFORE mutating the segment. If this fails, the old
    // dialogue/audio/video remain coherent.
    const { error: resetErr } = await service
      .from("podcasts")
      .update({ video_url: null, render_status: "idle", render_error: null })
      .eq("id", id);
    if (resetErr) {
      console.error(`[podcast/segments] could not clear stale render for ${id}:`, resetErr);
      return NextResponse.json(
        { error: "Could not clear the stale video. Your previous line was kept." },
        { status: 500 },
      );
    }

    const { data: updated, error: updateErr } = await service
      .from("podcast_segments")
      .update({
        text,
        audio_url: null,
        start_ms: null,
        end_ms: null,
        status: "pending",
      })
      .eq("id", segmentId)
      .eq("podcast_id", id)
      .select()
      .single();
    if (updateErr || !updated) {
      console.error(`[podcast/segments] update failed for ${segmentId}:`, updateErr);
      return NextResponse.json({ error: "Could not save the edited line." }, { status: 500 });
    }

    return NextResponse.json({ segment: updated });
  } catch (err) {
    console.error("PATCH /api/podcasts/[id]/segments/[segmentId]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const MIN_SEGMENTS = 2;

/**
 * DELETE /api/podcasts/[id]/segments/[segmentId]
 * Remove one dialogue line (min 2 lines kept). Invalidates the rendered MP4
 * BEFORE deleting. Other lines keep their audio; order_index gaps are fine
 * (everything reads ORDER BY order_index).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, segmentId } = await params;
    const service = createServiceClient();

    const { data: podcast } = await service.from("podcasts").select("id, user_id").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: segments } = await service
      .from("podcast_segments")
      .select("id")
      .eq("podcast_id", id);
    if (!segments?.some((s) => s.id === segmentId)) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }
    if (segments.length <= MIN_SEGMENTS) {
      return NextResponse.json({ error: `A podcast must keep at least ${MIN_SEGMENTS} lines` }, { status: 400 });
    }

    // Invalidate the stale render BEFORE deleting.
    const { error: resetErr } = await service
      .from("podcasts")
      .update({ video_url: null, render_status: "idle", render_error: null })
      .eq("id", id);
    if (resetErr) {
      console.error(`[podcast/segments] reset render failed for ${id}:`, resetErr);
      return NextResponse.json({ error: "Could not clear the stale video. The line was kept." }, { status: 500 });
    }

    const { error: delErr } = await service
      .from("podcast_segments")
      .delete()
      .eq("id", segmentId)
      .eq("podcast_id", id);
    if (delErr) {
      console.error(`[podcast/segments] delete failed for ${segmentId}:`, delErr);
      return NextResponse.json({ error: "Could not delete the line." }, { status: 500 });
    }

    return NextResponse.json({ deleted: segmentId });
  } catch (err) {
    console.error("DELETE /api/podcasts/[id]/segments/[segmentId]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
