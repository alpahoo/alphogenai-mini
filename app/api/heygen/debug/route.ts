// TEMPORARY debug — isolate which param r2v (reference-to-video) rejects.
import { NextResponse } from "next/server";

const URL_ = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";
const REF = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/480px-Cat03.jpg";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const headers = {
    Authorization: `Bearer ${process.env.BYTEPLUS_ARK_API_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
  const model = "seedance-1-5-pro-251215";
  const refContent = [
    { type: "text", text: "a person in a warm living room, cinematic" },
    { type: "image_url", image_url: { url: REF }, role: "reference_image" },
  ];

  const variants: Record<string, Record<string, unknown>> = {
    full: { model, content: refContent, ratio: "16:9", resolution: "720p", duration: 5, generate_audio: true, return_last_frame: true },
    no_audio: { model, content: refContent, ratio: "16:9", resolution: "720p", duration: 5, generate_audio: false, return_last_frame: true },
    no_lastframe: { model, content: refContent, ratio: "16:9", resolution: "720p", duration: 5, generate_audio: true },
    minimal: { model, content: refContent, ratio: "16:9", resolution: "720p", duration: 5 },
    no_audio_no_lf: { model, content: refContent, ratio: "16:9", resolution: "720p", duration: 5, generate_audio: false },
  };

  const out: Record<string, unknown> = {};
  for (const [label, body] of Object.entries(variants)) {
    try {
      const r = await fetch(URL_, { method: "POST", headers, body: JSON.stringify(body) });
      out[label] = { status: r.status, body: (await r.text()).slice(0, 260) };
    } catch (e) {
      out[label] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json(out);
}
