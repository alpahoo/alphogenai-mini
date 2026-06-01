import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  createPhotoAvatar,
  cloneVoice,
  listVoices as listHeyGenVoices,
  listAvatars as listHeyGenAvatars,
} from "@/lib/heygen-client";

/**
 * GET /api/heygen — List user's avatars & voices (DB) + stock voices (HeyGen).
 *   On first load (0 avatars in DB), auto-imports from HeyGen account.
 * POST /api/heygen — Create a photo avatar or clone a voice.
 *
 * Auth required. Each user only sees their own avatars and cloned voices.
 * Resources are stored in `user_avatars` table scoped by user_id.
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

  // Fetch user's own avatars & voices from DB
  const { data: dbRows, error: dbErr } = await svc
    .from("user_avatars")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (dbErr) {
    console.error("[heygen] DB query failed:", dbErr.message);
  }

  const rows = dbRows ?? [];
  let userAvatars = rows
    .filter((r) => r.type === "avatar")
    .map((r) => ({
      avatarId: String(r.external_id),
      name: String(r.name ?? ""),
      previewUrl: (r.preview_url as string | null) ?? null,
      gender: ((r.metadata as Record<string, string>)?.gender as string) ?? "",
      isOwn: true as boolean,
    }));

  // ── Auto-import on first load ─────────────────────────────────────────
  // If user has 0 avatars in DB, sync from HeyGen account (one-time).
  // This imports avatars created via the HeyGen dashboard so the user
  // doesn't have to recreate them.
  if (userAvatars.length === 0) {
    try {
      const heygenAvatars = await listHeyGenAvatars();
      if (heygenAvatars.length > 0) {
        // Bulk insert into DB — all scoped to this user
        const insertRows = heygenAvatars.map((a) => ({
          user_id: user.id,
          type: "avatar" as const,
          external_id: a.avatarId,
          name: a.name,
          preview_url: a.previewUrl,
          metadata: { gender: a.gender, imported: true },
        }));

        const { error: insertErr } = await svc
          .from("user_avatars")
          .upsert(insertRows, { onConflict: "user_id,type,external_id" });

        if (insertErr) {
          console.warn("[heygen] auto-import insert failed:", insertErr.message);
        } else {
          console.log(
            `[heygen] auto-imported ${heygenAvatars.length} avatars for user=${user.id}`
          );
        }

        // Use imported avatars for response
        userAvatars = heygenAvatars.map((a) => ({
          avatarId: a.avatarId,
          name: a.name,
          previewUrl: a.previewUrl,
          gender: a.gender,
          isOwn: true,
        }));
      }
    } catch (e) {
      console.warn(
        "[heygen] auto-import failed (non-fatal):",
        e instanceof Error ? e.message : e
      );
    }
  }

  // ── Voices: user's cloned (DB) + stock (HeyGen API) ───────────────────
  const userVoices = rows
    .filter((r) => r.type === "voice")
    .map((r) => ({
      voiceId: String(r.external_id),
      name: String(r.name ?? ""),
      language: ((r.metadata as Record<string, string>)?.language as string) ?? "",
      gender: ((r.metadata as Record<string, string>)?.gender as string) ?? "",
      isCloned: true,
    }));

  // Stock voices from HeyGen (shared, read-only — non-blocking)
  let stockVoices: typeof userVoices = [];
  try {
    const allVoices = await listHeyGenVoices();
    stockVoices = allVoices
      .filter((v) => !v.isCloned)
      .map((v) => ({
        voiceId: v.voiceId,
        name: v.name,
        language: v.language,
        gender: v.gender,
        isCloned: false,
      }));
  } catch (e) {
    console.warn("[heygen] listVoices failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    avatars: userAvatars,
    voices: [...userVoices, ...stockVoices],
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
