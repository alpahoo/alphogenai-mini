import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase/server-admin";

export async function GET() {
  try {
    const supa = getServerSupabaseAdmin();
    const { data, error } = await supa
      .from("admin_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const safe = {
      enable_elevenlabs: !!data?.enable_elevenlabs,
      default_audio_mode: (data?.default_audio_mode ?? "music") as "voice" | "music" | "none",
      music_source: (data?.music_source ?? "youtube") as "youtube" | "freepd" | "pixabay",
      default_voice_id: data?.default_voice_id ?? null,
      music_volume: Number(data?.music_volume ?? 0.7),
      updated_at: data?.updated_at ?? null,
    };
    return NextResponse.json(safe);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const token = req.headers.get("x-admin-token");
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const allowed = [
    "enable_elevenlabs",
    "default_audio_mode",
    "music_source",
    "default_voice_id",
    "music_volume",
  ];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  // validations
  if (
    update.default_audio_mode &&
    !["voice", "music", "none"].includes(String(update.default_audio_mode))
  ) {
    return NextResponse.json({ error: "invalid default_audio_mode" }, { status: 400 });
  }
  if (
    update.music_source &&
    !["youtube", "freepd", "pixabay"].includes(String(update.music_source))
  ) {
    return NextResponse.json({ error: "invalid music_source" }, { status: 400 });
  }
  if (update.music_volume !== undefined) {
    const v = Number(update.music_volume);
    if (Number.isNaN(v) || v < 0 || v > 1) {
      return NextResponse.json({ error: "music_volume must be 0..1" }, { status: 400 });
    }
    update.music_volume = v;
  }

  try {
    const supa = getServerSupabaseAdmin();
    const { data, error } = await supa
      .from("admin_settings")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
