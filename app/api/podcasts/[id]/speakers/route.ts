import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { isPodcastVoice } from "@/lib/podcast/voice-catalog";

/**
 * PATCH /api/podcasts/[id]/speakers
 * Set the host and/or guest voice_id from the podcast voice catalog. No migration
 * (podcast_speakers.voice_id already exists). Host and guest must end up distinct.
 *
 * Body: { host_voice_id?: string, guest_voice_id?: string }
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
    const hostVoice = body.host_voice_id;
    const guestVoice = body.guest_voice_id;

    if (hostVoice === undefined && guestVoice === undefined) {
      return NextResponse.json({ error: "Provide host_voice_id and/or guest_voice_id" }, { status: 400 });
    }
    if (hostVoice !== undefined && !isPodcastVoice(hostVoice)) {
      return NextResponse.json({ error: "host_voice_id is not a known voice" }, { status: 400 });
    }
    if (guestVoice !== undefined && !isPodcastVoice(guestVoice)) {
      return NextResponse.json({ error: "guest_voice_id is not a known voice" }, { status: 400 });
    }

    const { data: speakers } = await service
      .from("podcast_speakers")
      .select("id, role, voice_id")
      .eq("podcast_id", id);
    const host = speakers?.find((s) => s.role === "host");
    const guest = speakers?.find((s) => s.role === "guest");
    if (!host || !guest) {
      return NextResponse.json({ error: "Podcast is missing its speakers" }, { status: 500 });
    }

    // Final voices after applying the requested changes must be distinct.
    const finalHost = hostVoice !== undefined ? hostVoice : host.voice_id;
    const finalGuest = guestVoice !== undefined ? guestVoice : guest.voice_id;
    if (finalHost && finalGuest && finalHost === finalGuest) {
      return NextResponse.json({ error: "Host and guest must use different voices" }, { status: 400 });
    }

    if (hostVoice !== undefined) {
      const { error } = await service.from("podcast_speakers").update({ voice_id: hostVoice }).eq("id", host.id);
      if (error) {
        console.error("[podcast/speakers] host update failed:", error);
        return NextResponse.json({ error: "Could not save the host voice" }, { status: 500 });
      }
    }
    if (guestVoice !== undefined) {
      const { error } = await service.from("podcast_speakers").update({ voice_id: guestVoice }).eq("id", guest.id);
      if (error) {
        console.error("[podcast/speakers] guest update failed:", error);
        return NextResponse.json({ error: "Could not save the guest voice" }, { status: 500 });
      }
    }

    const { data: updated } = await service
      .from("podcast_speakers")
      .select("id, role, name, position, voice_id")
      .eq("podcast_id", id)
      .order("position", { ascending: true });

    return NextResponse.json({ speakers: updated || [] });
  } catch (err) {
    console.error("PATCH /api/podcasts/[id]/speakers:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
