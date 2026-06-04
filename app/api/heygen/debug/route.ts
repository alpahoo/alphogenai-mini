// TEMPORARY debug route — inspect raw HeyGen shapes to fix cloned-voice
// detection + owned-avatar parsing. Secret-gated. DELETE after use.
import { NextResponse } from "next/server";

const V2 = "https://api.heygen.com/v2";

function hg() {
  return {
    "X-Api-Key": process.env.HEYGEN_API_KEY ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const out: Record<string, unknown> = {};

  try {
    const vr = await fetch(`${V2}/voices`, { headers: hg() });
    const vd = await vr.json();
    const voices: Record<string, unknown>[] = vd.data?.voices ?? vd.voices ?? [];
    out.voicesTotal = voices.length;
    out.voiceKeys = voices[0] ? Object.keys(voices[0]) : [];
    // The user's clones are named "digitalpaho..."
    out.myVoices = voices
      .filter((v) => String(v.name ?? "").toLowerCase().includes("digitalpaho"))
      .slice(0, 6);
  } catch (e) {
    out.voicesError = e instanceof Error ? e.message : String(e);
  }

  try {
    const ar = await fetch(`${V2}/avatar_group.list?include_public=false`, { headers: hg() });
    const ad = await ar.json();
    out.avatarGroupStatus = ar.status;
    out.avatarGroupRaw = ad;
  } catch (e) {
    out.avatarGroupError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
