import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";

const TEMP_OFFSET = 1_000_000;

/**
 * PATCH /api/podcasts/[id]/segments/reorder
 * Reorder dialogue lines. Body: { ordered_ids: string[] } — must be an exact
 * permutation of the podcast's current segment ids.
 *
 * Invalidates the rendered MP4 BEFORE mutating. Audio/timings stay attached to
 * each segment (content unchanged); the render recomputes timings from order.
 *
 * Collision-free against the UNIQUE(podcast_id, order_index) index:
 *  phase 1 — one statement shifts every row into a large-negative range
 *            (order_index -= TEMP_OFFSET): distinctness preserved, no overlap
 *            with the 0..n-1 targets;
 *  phase 2 — set each id to its final 0..n-1 position (targets are all free).
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

    const { data: podcast } = await service.from("podcasts").select("id, user_id").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const orderedIds: unknown = body.ordered_ids;
    if (!Array.isArray(orderedIds) || orderedIds.some((x) => typeof x !== "string")) {
      return NextResponse.json({ error: "ordered_ids must be an array of segment ids" }, { status: 400 });
    }

    const { data: segments } = await service
      .from("podcast_segments")
      .select("id")
      .eq("podcast_id", id);
    const currentIds = (segments || []).map((s) => s.id);

    // ordered_ids must be an EXACT permutation: same length, no dup, no foreign id.
    const orderedSet = new Set(orderedIds as string[]);
    const currentSet = new Set(currentIds);
    const isPermutation =
      orderedIds.length === currentIds.length &&
      orderedSet.size === orderedIds.length &&
      (orderedIds as string[]).every((x) => currentSet.has(x));
    if (!isPermutation) {
      return NextResponse.json(
        { error: "ordered_ids must be an exact permutation of this podcast's segments" },
        { status: 400 },
      );
    }

    // Invalidate the stale render BEFORE mutating.
    const { error: resetErr } = await service
      .from("podcasts")
      .update({ video_url: null, render_status: "idle", render_error: null })
      .eq("id", id);
    if (resetErr) {
      console.error(`[podcast/reorder] reset render failed for ${id}:`, resetErr);
      return NextResponse.json({ error: "Could not clear the stale video. Order unchanged." }, { status: 500 });
    }

    // Phase 1: move every row into a distinct large-negative slot so the final
    // 0..n-1 targets are all free (no UNIQUE collision). PostgREST can't express
    // `col = col - n`, so we write each row to -(TEMP_OFFSET + i).
    for (let i = 0; i < currentIds.length; i++) {
      const { error } = await service
        .from("podcast_segments")
        .update({ order_index: -(TEMP_OFFSET + i) })
        .eq("id", currentIds[i])
        .eq("podcast_id", id);
      if (error) {
        console.error(`[podcast/reorder] phase1 failed for ${currentIds[i]}:`, error);
        return NextResponse.json({ error: "Could not reorder the lines." }, { status: 500 });
      }
    }

    // Phase 2: assign final 0..n-1 positions.
    const ids = orderedIds as string[];
    for (let pos = 0; pos < ids.length; pos++) {
      const { error } = await service
        .from("podcast_segments")
        .update({ order_index: pos })
        .eq("id", ids[pos])
        .eq("podcast_id", id);
      if (error) {
        console.error(`[podcast/reorder] phase2 failed for ${ids[pos]}:`, error);
        return NextResponse.json({ error: "Could not reorder the lines." }, { status: 500 });
      }
    }

    const { data: updated } = await service
      .from("podcast_segments")
      .select("*")
      .eq("podcast_id", id)
      .order("order_index", { ascending: true });

    return NextResponse.json({ segments: updated || [] });
  } catch (err) {
    console.error("PATCH /api/podcasts/[id]/segments/reorder:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
