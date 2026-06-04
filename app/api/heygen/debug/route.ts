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

  // Probe candidate "owned voices" endpoints
  const V1 = "https://api.heygen.com/v1";
  for (const [label, ep] of [
    ["brandVoice", `${V1}/brand_voice/list`],
    ["voiceList", `${V1}/voice.list`],
  ] as const) {
    try {
      const r = await fetch(ep, { headers: hg() });
      const j = await r.json().catch(() => ({}));
      out[`${label}Status`] = r.status;
      out[`${label}Raw`] = JSON.stringify(j).slice(0, 1200);
    } catch (e) {
      out[`${label}Error`] = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(out);
}
