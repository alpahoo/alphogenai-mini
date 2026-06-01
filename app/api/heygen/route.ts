import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  createPhotoAvatar,
  cloneVoice,
  listVoices,
} from "@/lib/heygen-client";

/**
 * GET /api/heygen — List available voices (stock + cloned).
 * POST /api/heygen — Create a photo avatar or clone a voice.
 *
 * Auth required. Premium plan required.
 */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const voices = await listVoices();
    return NextResponse.json({ voices });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[heygen/voices] list failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body as { action: string };

  // ── Create Photo Avatar ───────────────────────────────────────────────
  if (action === "create_avatar") {
    const { image_url, name } = body as { image_url: string; name?: string };
    if (!image_url) {
      return NextResponse.json(
        { error: "image_url is required" },
        { status: 400 }
      );
    }

    try {
      const result = await createPhotoAvatar({
        imageUrl: image_url,
        name: name ?? `Avatar - ${user.email?.split("@")[0] ?? "user"}`,
      });
      console.log(
        `[heygen] avatar created: ${result.avatarId} for user=${user.id}`
      );
      return NextResponse.json({
        success: true,
        avatar_id: result.avatarId,
        status: result.status,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[heygen/avatar] create failed:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Clone Voice ───────────────────────────────────────────────────────
  if (action === "clone_voice") {
    const { audio_url, name } = body as { audio_url: string; name?: string };
    if (!audio_url) {
      return NextResponse.json(
        { error: "audio_url is required" },
        { status: 400 }
      );
    }

    try {
      const result = await cloneVoice({
        audioUrl: audio_url,
        name: name ?? `Voice - ${user.email?.split("@")[0] ?? "user"}`,
      });
      console.log(
        `[heygen] voice cloned: ${result.voiceId} for user=${user.id}`
      );
      return NextResponse.json({
        success: true,
        voice_id: result.voiceId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[heygen/voice] clone failed:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
