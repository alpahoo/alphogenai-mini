import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { getPodcastStudioPreset, PODCAST_STUDIO_PRESETS } from "@/lib/podcast/studio-presets";
import { buildPodcastStudioPreviewPrompt, getPodcastStudioStyle } from "@/lib/podcast/studio-preview";
import { uploadBufferToR2 } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 300;

const PORTRAIT_BUCKET = "podcast-personas";

async function resolvePortraitUrl(
  service: ReturnType<typeof createServiceClient>,
  portraitPath: string,
) {
  if (/^https?:\/\//.test(portraitPath)) return portraitPath;
  const { data, error } = await service.storage
    .from(PORTRAIT_BUCKET)
    .createSignedUrl(portraitPath, 60 * 60);
  if (error || !data?.signedUrl) throw new Error("Could not read a selected presenter portrait");
  return data.signedUrl;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (body.confirm !== true) {
      return NextResponse.json({ error: "Studio preview confirmation is required" }, { status: 400 });
    }

    const { id } = await params;
    const service = createServiceClient();
    const { data: podcast } = await service
      .from("podcasts")
      .select("id,user_id,metadata")
      .eq("id", id)
      .maybeSingle();
    if (!podcast || podcast.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: speakers, error: speakerError } = await service
      .from("podcast_speakers")
      .select("role,persona_id")
      .eq("podcast_id", id);
    if (speakerError) throw new Error("Could not load podcast presenters");
    const hostPersonaId = speakers?.find((speaker) => speaker.role === "host")?.persona_id;
    const guestPersonaId = speakers?.find((speaker) => speaker.role === "guest")?.persona_id;
    if (!hostPersonaId || !guestPersonaId || hostPersonaId === guestPersonaId) {
      return NextResponse.json({ error: "Choose two different presenters first" }, { status: 400 });
    }

    const { data: personas, error: personaError } = await service
      .from("podcast_personas")
      .select("id,user_id,portrait_path,status")
      .in("id", [hostPersonaId, guestPersonaId]);
    if (personaError) throw new Error("Could not load selected presenters");
    const accessible = (personas ?? []).filter(
      (persona) => persona.status === "active" && (persona.user_id === null || persona.user_id === user.id),
    );
    const host = accessible.find((persona) => persona.id === hostPersonaId);
    const guest = accessible.find((persona) => persona.id === guestPersonaId);
    if (!host || !guest) {
      return NextResponse.json({ error: "One of the selected presenters is unavailable" }, { status: 400 });
    }

    const apiKey = process.env.BYTEPLUS_ARK_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Studio preview is temporarily unavailable" }, { status: 503 });

    const [hostImageUrl, guestImageUrl] = await Promise.all([
      resolvePortraitUrl(service, host.portrait_path),
      resolvePortraitUrl(service, guest.portrait_path),
    ]);
    const style = getPodcastStudioStyle(body.style);
    const baseUrl = process.env.BYTEPLUS_BASE_URL || "https://ark.ap-southeast.bytepluses.com";
    const response = await fetch(`${baseUrl}/api/v3/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.BYTEPLUS_SEEDREAM_MODEL || "seedream-4-5-251128",
        prompt: buildPodcastStudioPreviewPrompt(style.id),
        image: [hostImageUrl, guestImageUrl],
        size: "2K",
        response_format: "url",
        watermark: false,
      }),
      signal: AbortSignal.timeout(240_000),
    });
    const result = await response.json().catch(() => ({}));
    const sourceUrl = Array.isArray(result?.data) && typeof result.data[0]?.url === "string"
      ? result.data[0].url
      : "";
    if (!response.ok || !sourceUrl) throw new Error("Studio image generation failed");

    const download = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!download.ok) throw new Error("Could not download the studio preview");
    const source = Buffer.from(await download.arrayBuffer());
    if (source.length < 1_000) throw new Error("Studio preview output was invalid");
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(source)
      .resize(1920, 1080, { fit: "cover", position: "centre" })
      .jpeg({ quality: 92 })
      .toBuffer();
    const previewId = randomUUID();
    const previewUrl = await uploadBufferToR2(
      jpeg,
      `podcast/studio-previews/${id}/${previewId}.jpg`,
      "image/jpeg",
    );

    // Clear the previous MP4 before changing a visual input. If this fails,
    // the generated R2 image is harmlessly orphaned and the old render remains coherent.
    const { error: resetError } = await service
      .from("podcasts")
      .update({ video_url: null, render_status: "idle", render_error: null })
      .eq("id", id);
    if (resetError) {
      return NextResponse.json({ error: "Could not clear the previous video" }, { status: 500 });
    }

    const currentMetadata = podcast.metadata && typeof podcast.metadata === "object"
      ? podcast.metadata as Record<string, unknown>
      : {};
    const metadata = {
      ...currentMetadata,
      studio_preview_id: previewId,
      studio_preview_url: previewUrl,
      studio_preview_style: style.id,
      studio_preview_personas: { host: hostPersonaId, guest: guestPersonaId },
    };
    const { data: updatedPodcast, error: updateError } = await service
      .from("podcasts")
      .update({ metadata, video_url: null, render_status: "idle", render_error: null })
      .eq("id", id)
      .select()
      .single();
    if (updateError || !updatedPodcast) throw new Error("Could not save the studio preview");

    return NextResponse.json({ podcast: updatedPodcast, preview: { id: previewId, url: previewUrl, style: style.id } });
  } catch (error) {
    console.error("POST /api/podcasts/[id]/studio:", error);
    return NextResponse.json({ error: "Could not create the studio preview" }, { status: 500 });
  }
}

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
      .select("id,role,persona_id")
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

    // Catalog personas can be retired independently from a studio pack. Only
    // bind identities that still exist; the studio shots remain valid and the
    // current speaker identity is preserved for a missing role.
    const { data: availablePersonas, error: personaError } = await service
      .from("podcast_personas")
      .select("id")
      .in("id", [preset.hostPersonaId, preset.guestPersonaId]);
    if (personaError) throw new Error(`Could not load studio presenters: ${personaError.message}`);
    const availablePersonaIds = new Set((availablePersonas ?? []).map((persona) => persona.id));
    const hostPersonaId = availablePersonaIds.has(preset.hostPersonaId)
      ? preset.hostPersonaId
      : host.persona_id;
    const guestPersonaId = availablePersonaIds.has(preset.guestPersonaId)
      ? preset.guestPersonaId
      : guest.persona_id;

    const { data: clips, error: clipError } = await service
      .from("podcast_persona_base_clips")
      .select("id,persona_id,prompt_version,status")
      .in("persona_id", [preset.hostPersonaId, preset.guestPersonaId])
      .eq("status", "ready");
    if (clipError) throw new Error(`Could not load studio motion: ${clipError.message}`);

    const hostCandidates = clips?.filter((clip) => clip.persona_id === preset.hostPersonaId) ?? [];
    const guestCandidates = clips?.filter((clip) => clip.persona_id === preset.guestPersonaId) ?? [];
    const hostClip = hostCandidates.find((clip) => clip.prompt_version === preset.hostPromptVersion)
      ?? hostCandidates.find((clip) => clip.id === existingHostClipId);
    const guestClip = guestCandidates.find((clip) => clip.prompt_version === preset.guestPromptVersion)
      ?? guestCandidates.find((clip) => clip.id === existingGuestClipId);

    // Clear the old MP4 before changing any visual input.
    const { error: resetError } = await service
      .from("podcasts")
      .update({ video_url: null, render_status: "idle", render_error: null })
      .eq("id", id);
    if (resetError) {
      return NextResponse.json({ error: "Could not clear the previous video" }, { status: 500 });
    }

    if (hostPersonaId !== host.persona_id) {
      const { error: hostError } = await service
        .from("podcast_speakers")
        .update({ persona_id: hostPersonaId })
        .eq("id", host.id);
      if (hostError) throw new Error(`Could not set the host: ${hostError.message}`);
    }
    if (guestPersonaId !== guest.persona_id) {
      const { error: guestError } = await service
        .from("podcast_speakers")
        .update({ persona_id: guestPersonaId })
        .eq("id", guest.id);
      if (guestError) throw new Error(`Could not set the guest: ${guestError.message}`);
    }

    const metadata = {
      ...currentMetadata,
      render_mode: "talking_visual",
      studio_preset_id: preset.id,
      studio_pack_id: preset.packId,
      studio_shots: preset.shots,
      studio_base_clips: {
        ...(hostClip ? { host: hostClip.id } : {}),
        ...(guestClip ? { guest: guestClip.id } : {}),
      },
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

    return NextResponse.json({
      podcast: updatedPodcast,
      speakers: updatedSpeakers || [],
      preset,
      motion: { host: Boolean(hostClip), guest: Boolean(guestClip) },
      presenters: {
        host: hostPersonaId,
        guest: guestPersonaId,
      },
    });
  } catch (error) {
    console.error("PATCH /api/podcasts/[id]/studio:", error);
    return NextResponse.json({ error: "Could not prepare the studio" }, { status: 500 });
  }
}
