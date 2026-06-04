import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  createPhotoAvatar,
  cloneVoice,
  listVoices as listHeyGenVoices,
  listOwnedAvatars as listHeyGenOwnedAvatars,
} from "@/lib/heygen-client";

/**
 * GET /api/heygen — List custom avatars + voices for the avatar studio.
 * POST /api/heygen — Create a photo avatar or clone a voice.
 *
 * Auth required. Custom (user-created) avatars are read live from HeyGen
 * and identified by their 32-char hex IDs (stock library avatars use
 * descriptive IDs like "Abigail_..."). DB-tracked items (created via this
 * app) are merged in. Stock voices are appended after cloned voices.
 */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();

  // DB-tracked items (created via this app), if any
  const { data: dbRows } = await svc
    .from("user_avatars")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const rows = dbRows ?? [];

  // ── Avatars: every avatar from the account's HeyGen + DB-tracked ──────
  const avatarMap = new Map<
    string,
    {
      avatarId: string;
      name: string;
      previewUrl: string | null;
      gender: string;
      kind: "avatar" | "talking_photo";
    }
  >();

  // DB-tracked first (so app-created names win)
  for (const r of rows.filter((r) => r.type === "avatar")) {
    const kind =
      ((r.metadata as Record<string, string>)?.kind as "avatar" | "talking_photo") ??
      "avatar";
    avatarMap.set(String(r.external_id), {
      avatarId: String(r.external_id),
      name: String(r.name ?? ""),
      previewUrl: (r.preview_url as string | null) ?? null,
      gender: ((r.metadata as Record<string, string>)?.gender as string) ?? "",
      kind,
    });
  }

  try {
    // ONLY the account's own avatars ("My Avatars") — never the public library.
    const ownedAvatars = await listHeyGenOwnedAvatars();
    for (const a of ownedAvatars) {
      if (avatarMap.has(a.avatarId)) continue; // DB version wins
      avatarMap.set(a.avatarId, {
        avatarId: a.avatarId,
        name: a.name,
        previewUrl: a.previewUrl,
        gender: a.gender,
        kind: a.kind,
      });
    }
  } catch (e) {
    console.warn("[heygen] listOwnedAvatars failed:", e instanceof Error ? e.message : e);
  }

  const avatars = Array.from(avatarMap.values());

  // ── Voices: cloned (DB + HeyGen is_cloned) + stock ───────────────────
  type VoiceOut = {
    voiceId: string;
    name: string;
    language: string;
    gender: string;
    isCloned: boolean;
    previewUrl: string | null;
  };
  const voiceMap = new Map<string, VoiceOut>();

  // DB-tracked cloned voices first
  for (const r of rows.filter((r) => r.type === "voice")) {
    voiceMap.set(String(r.external_id), {
      voiceId: String(r.external_id),
      name: String(r.name ?? ""),
      language: ((r.metadata as Record<string, string>)?.language as string) ?? "",
      gender: ((r.metadata as Record<string, string>)?.gender as string) ?? "",
      isCloned: true,
      previewUrl:
        ((r.metadata as Record<string, string>)?.preview_url as string) ?? null,
    });
  }

  const clonedVoices: VoiceOut[] = [];
  const stockVoices: VoiceOut[] = [];
  try {
    const allVoices = await listHeyGenVoices();
    for (const v of allVoices) {
      const out: VoiceOut = {
        voiceId: v.voiceId,
        name: v.name,
        language: v.language,
        gender: v.gender,
        isCloned: v.isCloned,
        previewUrl: v.previewUrl,
      };
      if (v.isCloned) {
        if (!voiceMap.has(v.voiceId)) clonedVoices.push(out);
      } else {
        stockVoices.push(out);
      }
    }
  } catch (e) {
    console.warn("[heygen] listVoices failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    avatars,
    voices: [...Array.from(voiceMap.values()), ...clonedVoices, ...stockVoices],
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
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
      const avatarName =
        name ?? `Avatar - ${user.email?.split("@")[0] ?? "user"}`;
      const result = await createPhotoAvatar({
        imageUrl: image_url,
        name: avatarName,
      });

      // Persist in DB — scoped to this user
      await svc.from("user_avatars").upsert(
        {
          user_id: user.id,
          type: "avatar",
          external_id: result.avatarId,
          name: avatarName,
          preview_url: image_url,
          metadata: { status: result.status },
        },
        { onConflict: "user_id,type,external_id" }
      );

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
      const voiceName =
        name ?? `Voice - ${user.email?.split("@")[0] ?? "user"}`;
      const result = await cloneVoice({
        audioUrl: audio_url,
        name: voiceName,
      });

      // Persist in DB — scoped to this user
      await svc.from("user_avatars").upsert(
        {
          user_id: user.id,
          type: "voice",
          external_id: result.voiceId,
          name: voiceName,
          metadata: { cloned: true },
        },
        { onConflict: "user_id,type,external_id" }
      );

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
