import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  createPhotoAvatar,
  cloneVoice,
  listVoices as listHeyGenVoices,
} from "@/lib/heygen-client";

/**
 * GET /api/heygen — List user's avatars & voices (from DB) + stock voices from HeyGen.
 * POST /api/heygen — Create a photo avatar or clone a voice (persisted per-user in DB).
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

  // Fetch user's own avatars & voices from DB + stock voices from HeyGen (parallel)
  const [dbResult, stockVoicesResult] = await Promise.allSettled([
    svc
      .from("user_avatars")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    listHeyGenVoices(),
  ]);

  // Parse DB results into avatars and voices
  const dbRows =
    dbResult.status === "fulfilled" ? (dbResult.value.data ?? []) : [];
  const userAvatars = dbRows
    .filter((r: Record<string, unknown>) => r.type === "avatar")
    .map((r: Record<string, unknown>) => ({
      avatarId: String(r.external_id),
      name: String(r.name ?? ""),
      previewUrl: (r.preview_url as string) ?? null,
      gender: ((r.metadata as Record<string, unknown>)?.gender as string) ?? "",
      isOwn: true,
    }));
  const userVoices = dbRows
    .filter((r: Record<string, unknown>) => r.type === "voice")
    .map((r: Record<string, unknown>) => ({
      voiceId: String(r.external_id),
      name: String(r.name ?? ""),
      language: ((r.metadata as Record<string, unknown>)?.language as string) ?? "",
      gender: ((r.metadata as Record<string, unknown>)?.gender as string) ?? "",
      isCloned: true,
    }));

  // Stock voices from HeyGen (shared, read-only)
  const stockVoices =
    stockVoicesResult.status === "fulfilled"
      ? stockVoicesResult.value.filter((v) => !v.isCloned)
      : [];

  if (dbResult.status === "rejected") {
    console.error("[heygen] DB query failed:", dbResult.reason);
  }
  if (stockVoicesResult.status === "rejected") {
    console.error("[heygen] listVoices failed:", stockVoicesResult.reason);
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
      const avatarName = name ?? `Avatar - ${user.email?.split("@")[0] ?? "user"}`;
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
      const voiceName = name ?? `Voice - ${user.email?.split("@")[0] ?? "user"}`;
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
