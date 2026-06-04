// TEMPORARY debug — find the correct cinematic_avatar body schema.
// Secret-gated. DELETE after use.
import { NextResponse } from "next/server";

const V3 = "https://api.heygen.com/v3";
function hg() {
  return {
    "X-Api-Key": process.env.HEYGEN_API_KEY ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

const V3_AVATAR = "7c87af6ea71b4f67b30d4bd8b813ed53"; // digitalpaho v3 look
const TALKING_PHOTO = "4c262fb93bf74b89b158afef962b46f5"; // Lady2 look

async function tryBody(label: string, body: unknown, out: Record<string, unknown>) {
  try {
    const r = await fetch(`${V3}/videos`, {
      method: "POST",
      headers: hg(),
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    out[label] = { status: r.status, body: txt.slice(0, 500) };
  } catch (e) {
    out[label] = { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const out: Record<string, unknown> = {};
  const base = {
    prompt: "A person sitting calmly in a warm living room, cinematic.",
    duration: 4,
    resolution: "1080p",
    aspect_ratio: "16:9",
  };

  await tryBody("A_arr_v3", { type: "cinematic_avatar", avatar_id: [V3_AVATAR], ...base }, out);
  await tryBody("B_str_v3", { type: "cinematic_avatar", avatar_id: V3_AVATAR, ...base }, out);
  await tryBody("C_arr_tp", { type: "cinematic_avatar", avatar_id: [TALKING_PHOTO], ...base }, out);

  return NextResponse.json(out);
}
