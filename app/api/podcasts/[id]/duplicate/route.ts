import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";

/**
 * POST /api/podcasts/[id]/duplicate — deep-copy a podcast into a new draft (T-1141).
 *
 * Copies title (+" (Copy)"), source_topic/asset/language/layout/aspect_ratio,
 * metadata (style/duration), speakers (voice_id/persona_id) and segments
 * (text/order + speaker mapping). Segments are reset to `pending` with audio_url
 * null; render output (video_url/render_status/render_error) is NOT copied.
 *
 * Multi-table without a DB transaction over REST → best-effort with manual
 * rollback: on any failure after the podcast row is created, the new podcast is
 * deleted (children cascade) so no half-copy is left. 404 if not owned.
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

    const { data: src } = await service.from("podcasts").select("*").eq("id", id).single();
    if (!src || src.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: srcSpeakers } = await service
      .from("podcast_speakers")
      .select("*")
      .eq("podcast_id", id)
      .order("position", { ascending: true });
    const { data: srcSegments } = await service
      .from("podcast_segments")
      .select("*")
      .eq("podcast_id", id)
      .order("order_index", { ascending: true });

    // 1) New podcast row (no render output copied).
    const { data: copy, error: insErr } = await service
      .from("podcasts")
      .insert({
        user_id: user.id,
        title: `${(src.title || "Untitled podcast").slice(0, 190)} (Copy)`,
        source_mode: src.source_mode,
        source_topic: src.source_topic,
        source_asset_url: src.source_asset_url,
        layout: src.layout,
        aspect_ratio: src.aspect_ratio,
        language: src.language,
        metadata: src.metadata || {},
        status: "draft",
      })
      .select()
      .single();
    if (insErr || !copy) {
      console.error("[podcasts/duplicate] podcast insert failed:", insErr);
      return NextResponse.json({ error: "Failed to duplicate podcast" }, { status: 500 });
    }

    // From here on, roll back (delete copy → children cascade) on any failure.
    try {
      // 2) Speakers — copy role/name/position/voice_id/persona_id.
      const speakerRows = (srcSpeakers || []).map((s) => ({
        podcast_id: copy.id,
        role: s.role,
        name: s.name,
        position: s.position,
        voice_id: s.voice_id ?? null,
        persona_id: s.persona_id ?? null,
      }));
      const { data: newSpeakers, error: spErr } = speakerRows.length
        ? await service.from("podcast_speakers").insert(speakerRows).select()
        : { data: [], error: null };
      if (spErr) throw spErr;

      // Map old speaker_id → new speaker_id via role (unique host/guest per podcast).
      const roleToNewId = new Map((newSpeakers || []).map((s) => [s.role, s.id]));
      const oldIdToRole = new Map((srcSpeakers || []).map((s) => [s.id, s.role]));

      // 3) Segments — reset to pending, audio_url null, remap speaker_id.
      const segmentRows = (srcSegments || []).map((seg) => ({
        podcast_id: copy.id,
        speaker_id: roleToNewId.get(oldIdToRole.get(seg.speaker_id)) ?? null,
        order_index: seg.order_index,
        text: seg.text,
        status: "pending",
        audio_url: null,
      }));
      if (segmentRows.some((r) => !r.speaker_id)) {
        throw new Error("could not map a segment to a speaker");
      }
      if (segmentRows.length) {
        const { error: segErr } = await service.from("podcast_segments").insert(segmentRows);
        if (segErr) throw segErr;
      }

      return NextResponse.json({ podcast: copy }, { status: 201 });
    } catch (copyErr) {
      console.error("[podcasts/duplicate] copy failed, rolling back:", copyErr);
      await service.from("podcasts").delete().eq("id", copy.id);
      return NextResponse.json({ error: "Failed to duplicate podcast" }, { status: 500 });
    }
  } catch (err) {
    console.error("POST /api/podcasts/[id]/duplicate:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
