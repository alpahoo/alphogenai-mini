import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { TITLE_MAX, isAspectRatio, isLanguage, isLayout, isPodcastStyle, isPodcastTargetDuration } from "@/lib/podcast/podcast";

/**
 * GET /api/podcasts/[id] — full podcast (with speakers + segments). 404 if not owned.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const service = createServiceClient();

    const { data: podcast } = await service
      .from("podcasts")
      .select("*")
      .eq("id", id)
      .single();

    // Same 404 for "missing" and "not yours" — never leak existence.
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: speakers } = await service
      .from("podcast_speakers")
      .select("*")
      .eq("podcast_id", id)
      .order("position", { ascending: true });

    const { data: segments } = await service
      .from("podcast_segments")
      .select("*")
      .eq("podcast_id", id)
      .order("order_index", { ascending: true });

    return NextResponse.json({ podcast, speakers: speakers || [], segments: segments || [] });
  } catch (err) {
    console.error("GET /api/podcasts/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/podcasts/[id] — update title / layout / aspect_ratio / language. 404 if not owned.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const service = createServiceClient();

    const { data: podcast } = await service
      .from("podcasts")
      .select("id, user_id, metadata")
      .eq("id", id)
      .single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const update: Record<string, unknown> = {};

    // Studio settings (style/duration) live in metadata and DON'T invalidate the
    // render — they only drive the next Rewrite script (T-1141).
    const nextMeta: Record<string, unknown> = { ...(podcast.metadata as Record<string, unknown> | null || {}) };
    let metaChanged = false;
    if (body.podcast_style !== undefined) {
      if (!isPodcastStyle(body.podcast_style)) {
        return NextResponse.json({ error: "podcast_style must be casual | news | expert | debate | documentary" }, { status: 400 });
      }
      nextMeta.podcast_style = body.podcast_style;
      metaChanged = true;
    }
    if (body.target_duration_seconds !== undefined) {
      if (!isPodcastTargetDuration(body.target_duration_seconds)) {
        return NextResponse.json({ error: "target_duration_seconds must be 30, 60, 120, 300 or 600" }, { status: 400 });
      }
      nextMeta.target_duration_seconds = body.target_duration_seconds;
      metaChanged = true;
    }
    if (metaChanged) update.metadata = nextMeta;

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.length < 1 || body.title.length > TITLE_MAX) {
        return NextResponse.json({ error: `title must be 1..${TITLE_MAX} chars` }, { status: 400 });
      }
      update.title = body.title.trim();
    }
    if (body.layout !== undefined) {
      if (!isLayout(body.layout)) {
        return NextResponse.json({ error: "layout must be two_shot | split_screen | talk_show" }, { status: 400 });
      }
      update.layout = body.layout;
    }
    if (body.aspect_ratio !== undefined) {
      if (!isAspectRatio(body.aspect_ratio)) {
        return NextResponse.json({ error: "aspect_ratio must be 16:9 | 9:16" }, { status: 400 });
      }
      update.aspect_ratio = body.aspect_ratio;
    }
    if (body.language !== undefined) {
      if (!isLanguage(body.language)) {
        return NextResponse.json({ error: "language must match [a-z]{2}(-[A-Z]{2})?" }, { status: 400 });
      }
      update.language = body.language;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: updated, error } = await service
      .from("podcasts")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      console.error("PATCH /api/podcasts/[id] update error:", error);
      return NextResponse.json({ error: "Failed to update podcast" }, { status: 500 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/podcasts/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/podcasts/[id] — soft-delete (archive). Keeps the row + R2 assets;
 * GET /api/podcasts filters archived out. 404 if not owned (T-1141).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const service = createServiceClient();

    const { data: podcast } = await service
      .from("podcasts")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await service
      .from("podcasts")
      .update({ status: "archived" })
      .eq("id", id);
    if (error) {
      console.error("DELETE /api/podcasts/[id] archive error:", error);
      return NextResponse.json({ error: "Failed to archive podcast" }, { status: 500 });
    }
    return NextResponse.json({ success: true, archived: true });
  } catch (err) {
    console.error("DELETE /api/podcasts/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
