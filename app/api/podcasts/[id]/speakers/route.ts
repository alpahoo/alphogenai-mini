import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { isPodcastVoice } from "@/lib/podcast/voice-catalog";

/**
 * PATCH /api/podcasts/[id]/speakers
 * Set the host and/or guest voice_id (voice catalog) and/or persona_id
 * (podcast_personas — T-1136d Duo picker). No migration (both columns exist).
 *
 * Body: {
 *   host_voice_id?: string, guest_voice_id?: string,
 *   host_persona_id?: string | null, guest_persona_id?: string | null,
 * }
 * - voice: host/guest must end up distinct.
 * - persona: must be visible to the owner (catalog user_id IS NULL, or owned by
 *   the caller) and active; host/guest must end up distinct; null clears it;
 *   undefined leaves it unchanged.
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

    const { data: podcast } = await service.from("podcasts").select("id, user_id, metadata").eq("id", id).single();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const hostVoice = body.host_voice_id;
    const guestVoice = body.guest_voice_id;
    const hostPersona = body.host_persona_id; // string = set, null = clear, undefined = unchanged
    const guestPersona = body.guest_persona_id;

    const nothingProvided =
      hostVoice === undefined && guestVoice === undefined &&
      hostPersona === undefined && guestPersona === undefined;
    if (nothingProvided) {
      return NextResponse.json(
        { error: "Provide host/guest voice_id and/or persona_id" },
        { status: 400 },
      );
    }

    // ── Voice validation ──────────────────────────────────────────────────
    if (hostVoice !== undefined && !isPodcastVoice(hostVoice)) {
      return NextResponse.json({ error: "host_voice_id is not a known voice" }, { status: 400 });
    }
    if (guestVoice !== undefined && !isPodcastVoice(guestVoice)) {
      return NextResponse.json({ error: "guest_voice_id is not a known voice" }, { status: 400 });
    }

    // ── Persona validation (visibility + shape) ───────────────────────────
    const wantsPersona = (v: unknown): v is string => typeof v === "string" && v.length > 0;
    const requestedPersonaIds = [hostPersona, guestPersona].filter(wantsPersona);
    if (requestedPersonaIds.length > 0) {
      const { data: personas } = await service
        .from("podcast_personas")
        .select("id, user_id, status")
        .in("id", requestedPersonaIds);
      const byId = new Map((personas || []).map((p) => [p.id, p]));
      for (const pid of requestedPersonaIds) {
        const p = byId.get(pid);
        // Catalog (user_id NULL) or owned by the caller; must be active.
        const visible = p && p.status === "active" && (p.user_id === null || p.user_id === user.id);
        if (!visible) {
          return NextResponse.json({ error: "persona not found or not allowed" }, { status: 400 });
        }
      }
    }
    // Reject malformed persona values (not string, not null).
    for (const v of [hostPersona, guestPersona]) {
      if (v !== undefined && v !== null && typeof v !== "string") {
        return NextResponse.json({ error: "persona_id must be a string or null" }, { status: 400 });
      }
    }

    const { data: speakers } = await service
      .from("podcast_speakers")
      .select("id, role, voice_id, persona_id")
      .eq("podcast_id", id);
    const host = speakers?.find((s) => s.role === "host");
    const guest = speakers?.find((s) => s.role === "guest");
    if (!host || !guest) {
      return NextResponse.json({ error: "Podcast is missing its speakers" }, { status: 500 });
    }

    // Final voices after applying the requested changes must be distinct.
    const finalHostVoice = hostVoice !== undefined ? hostVoice : host.voice_id;
    const finalGuestVoice = guestVoice !== undefined ? guestVoice : guest.voice_id;
    if (finalHostVoice && finalGuestVoice && finalHostVoice === finalGuestVoice) {
      return NextResponse.json({ error: "Host and guest must use different voices" }, { status: 400 });
    }

    // Final personas must be distinct (V1: no shared persona for both speakers).
    const finalHostPersona = hostPersona !== undefined ? hostPersona : host.persona_id;
    const finalGuestPersona = guestPersona !== undefined ? guestPersona : guest.persona_id;
    if (finalHostPersona && finalGuestPersona && finalHostPersona === finalGuestPersona) {
      return NextResponse.json({ error: "Host and guest must use different personas" }, { status: 400 });
    }

    // A persona change alters the rendered visuals → clear the stale MP4 BEFORE
    // mutating speakers (same transactional order as tts/segments). Only when a
    // persona value actually changes; a no-op (same value) skips the reset.
    const personaChanged =
      (hostPersona !== undefined && hostPersona !== (host.persona_id ?? null)) ||
      (guestPersona !== undefined && guestPersona !== (guest.persona_id ?? null));
    if (personaChanged) {
      const currentMetadata = podcast.metadata && typeof podcast.metadata === "object"
        ? podcast.metadata as Record<string, unknown>
        : {};
      const metadata = { ...currentMetadata };
      for (const key of [
        "studio_preview_id",
        "studio_preview_url",
        "studio_preview_style",
        "studio_preview_personas",
        "studio_preset_id",
        "studio_pack_id",
        "studio_shots",
        "studio_base_clips",
      ]) delete metadata[key];
      const { error: resetErr } = await service
        .from("podcasts")
        .update({ metadata, video_url: null, render_status: "idle", render_error: null })
        .eq("id", id);
      if (resetErr) {
        console.error("[podcast/speakers] stale-render reset failed:", resetErr);
        return NextResponse.json({ error: "Could not clear the stale rendered video" }, { status: 500 });
      }
    }

    // ── Apply ─────────────────────────────────────────────────────────────
    const hostPatch: Record<string, unknown> = {};
    const guestPatch: Record<string, unknown> = {};
    if (hostVoice !== undefined) hostPatch.voice_id = hostVoice;
    if (guestVoice !== undefined) guestPatch.voice_id = guestVoice;
    if (hostPersona !== undefined) hostPatch.persona_id = hostPersona;
    if (guestPersona !== undefined) guestPatch.persona_id = guestPersona;

    if (Object.keys(hostPatch).length > 0) {
      const { error } = await service.from("podcast_speakers").update(hostPatch).eq("id", host.id);
      if (error) {
        console.error("[podcast/speakers] host update failed:", error);
        return NextResponse.json({ error: "Could not save the host speaker" }, { status: 500 });
      }
    }
    if (Object.keys(guestPatch).length > 0) {
      const { error } = await service.from("podcast_speakers").update(guestPatch).eq("id", guest.id);
      if (error) {
        console.error("[podcast/speakers] guest update failed:", error);
        return NextResponse.json({ error: "Could not save the guest speaker" }, { status: 500 });
      }
    }

    const { data: updated } = await service
      .from("podcast_speakers")
      .select("id, role, name, position, voice_id, persona_id")
      .eq("podcast_id", id)
      .order("position", { ascending: true });

    return NextResponse.json({ speakers: updated || [] });
  } catch (err) {
    console.error("PATCH /api/podcasts/[id]/speakers:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
