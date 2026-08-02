import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { getPodcastStudioPreset, PODCAST_STUDIO_PRESETS } from "@/lib/podcast/studio-presets";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ presets: PODCAST_STUDIO_PRESETS });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const preset = getPodcastStudioPreset(body.preset_id);
    if (!preset) return NextResponse.json({ error: "Unknown studio preset" }, { status: 400 });

    const service = createServiceClient();
    const { data: podcast } = await service
      .from("podcasts")
      .select("id,user_id,metadata")
      .eq("id", id)
      .maybeSingle();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: speakers } = await service
      .from("podcast_speakers")
      .select("id,role")
      .eq("podcast_id", id);
    const host = speakers?.find((speaker) => speaker.role === "host");
    const guest = speakers?.find((speaker) => speaker.role === "guest");
    if (!host || !guest) {
      return NextResponse.json({ error: "Podcast is missing its speakers" }, { status: 500 });
    }

    const currentMetadata = podcast.metadata && typeof podcast.metadata === "object"
      ? podcast.metadata as Record<string, unknown>
      : {};
    const boundClipIds = currentMetadata.studio_base_clips && typeof currentMetadata.studio_base_clips === "object"
      ? currentMetadata.studio_base_clips as Record<string, unknown>
      : {};
    const existingHostClipId = typeof boundClipIds.host === "string" ? boundClipIds.host : "";
    const existingGuestClipId = typeof boundClipIds.guest === "string" ? boundClipIds.guest : "";

    const { data: clips, error: clipError } = await service
      .from("podcast_persona_base_clips")
      .select("id,persona_id,prompt_version,status")
      .in("persona_id", [preset.hostPersonaId, preset.guestPersonaId])
      .eq("status", "ready");
    if (clipError) throw new Error(`Could not load studio motion: ${clipError.message}`);

    const hostClip = clips?.find((clip) =>
      clip.persona_id === preset.hostPersonaId && (
        clip.id === existingHostClipId || clip.prompt_version === preset.hostPromptVersion
      ),
    );
    const guestClip = clips?.find((clip) =>
      clip.persona_id === preset.guestPersonaId && (
        clip.id === existingGuestClipId || clip.prompt_version === preset.guestPromptVersion
      ),
    );
    if (!hostClip || !guestClip) {
      return NextResponse.json({ error: "This studio is still preparing its presenters" }, { status: 409 });
    }

    // Clear the old MP4 before changing any visual input.
    const { error: resetError } = await service
      .from("podcasts")
      .update({ video_url: null, render_status: "idle", render_error: null })
      .eq("id", id);
    if (resetError) {
      return NextResponse.json({ error: "Could not clear the previous video" }, { status: 500 });
    }

    const { error: hostError } = await service
      .from("podcast_speakers")
      .update({ persona_id: preset.hostPersonaId })
      .eq("id", host.id);
    if (hostError) throw new Error(`Could not set the host: ${hostError.message}`);
    const { error: guestError } = await service
      .from("podcast_speakers")
      .update({ persona_id: preset.guestPersonaId })
      .eq("id", guest.id);
    if (guestError) throw new Error(`Could not set the guest: ${guestError.message}`);

    const metadata = {
      ...currentMetadata,
      render_mode: "talking_visual",
      studio_preset_id: preset.id,
      studio_pack_id: preset.packId,
      studio_shots: preset.shots,
      studio_base_clips: { host: hostClip.id, guest: guestClip.id },
    };
    const { data: updatedPodcast, error: updateError } = await service
      .from("podcasts")
      .update({ metadata, video_url: null, render_status: "idle", render_error: null })
      .eq("id", id)
      .select()
      .single();
    if (updateError || !updatedPodcast) {
      throw new Error(`Could not bind the studio: ${updateError?.message ?? "no row"}`);
    }

    const { data: updatedSpeakers } = await service
      .from("podcast_speakers")
      .select("id,role,name,position,voice_id,persona_id")
      .eq("podcast_id", id)
      .order("position", { ascending: true });

    return NextResponse.json({ podcast: updatedPodcast, speakers: updatedSpeakers || [], preset });
  } catch (error) {
    console.error("PATCH /api/podcasts/[id]/studio:", error);
    return NextResponse.json({ error: "Could not prepare the studio" }, { status: 500 });
  }
}
