import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";

const SEGMENT_TEXT_MAX = 600;
const MAX_SEGMENTS = 10;

/**
 * POST /api/podcasts/[id]/segments
 * Append a new pending dialogue line at the end (order_index = max + 1).
 * Body: { speaker_role: "host" | "guest", text: string }
 *
 * Invalidates the rendered MP4 BEFORE inserting (T-1133a invariant). The new line
 * has no audio (status=pending); existing lines keep their audio.
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

    const { data: podcast } = await service.from("podcasts").select("id, user_id").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const role = body.speaker_role;
    if (role !== "host" && role !== "guest") {
      return NextResponse.json({ error: "speaker_role must be 'host' or 'guest'" }, { status: 400 });
    }
    const text = typeof body.text === "string" ? body.text.trim().replace(/\s+/g, " ") : "";
    if (!text || text.length > SEGMENT_TEXT_MAX) {
      return NextResponse.json({ error: `text must be 1..${SEGMENT_TEXT_MAX} chars` }, { status: 400 });
    }

    const { data: speakers } = await service
      .from("podcast_speakers")
      .select("id, role")
      .eq("podcast_id", id);
    const speaker = speakers?.find((s) => s.role === role);
    if (!speaker) {
      return NextResponse.json({ error: "Podcast is missing its speakers" }, { status: 500 });
    }

    const { data: segments } = await service
      .from("podcast_segments")
      .select("order_index")
      .eq("podcast_id", id);
    const count = segments?.length ?? 0;
    if (count >= MAX_SEGMENTS) {
      return NextResponse.json({ error: `A podcast can have at most ${MAX_SEGMENTS} lines` }, { status: 400 });
    }
    const maxOrder = count > 0 ? Math.max(...segments!.map((s) => s.order_index)) : -1;

    // Invalidate the stale render BEFORE inserting.
    const { error: resetErr } = await service
      .from("podcasts")
      .update({ video_url: null, render_status: "idle", render_error: null })
      .eq("id", id);
    if (resetErr) {
      console.error(`[podcast/segments] reset render failed for ${id}:`, resetErr);
      return NextResponse.json({ error: "Could not clear the stale video. No line was added." }, { status: 500 });
    }

    const { data: inserted, error: insertErr } = await service
      .from("podcast_segments")
      .insert({
        podcast_id: id,
        speaker_id: speaker.id,
        order_index: maxOrder + 1,
        text,
        status: "pending",
      })
      .select()
      .single();
    if (insertErr || !inserted) {
      console.error(`[podcast/segments] insert failed for ${id}:`, insertErr);
      return NextResponse.json({ error: "Could not add the line." }, { status: 500 });
    }

    return NextResponse.json({ segment: inserted }, { status: 201 });
  } catch (err) {
    console.error("POST /api/podcasts/[id]/segments:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
