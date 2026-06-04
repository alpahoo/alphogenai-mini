// TEMPORARY debug — find which Seedance model id is activated. Secret-gated.
import { NextResponse } from "next/server";

const URL_ = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const headers = {
    Authorization: `Bearer ${process.env.BYTEPLUS_ARK_API_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
  const candidates = [
    "dreamina-seedance-2-0-260128",
    "dreamina-seedance-2-0-250528",
    "dreamina-seedance-2-0",
    "dreamina-seedance-2-0-fast-260128",
    "dreamina-seedance-2-0-fast-250528",
    "seedance-2-0",
  ];
  const out: Record<string, unknown> = {};
  for (const model of candidates) {
    try {
      const r = await fetch(URL_, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          content: [{ type: "text", text: "a calm ocean at sunset" }],
          ratio: "16:9",
          resolution: "720p",
          duration: 5,
        }),
      });
      const txt = await r.text();
      out[model] = { status: r.status, body: txt.slice(0, 220) };
    } catch (e) {
      out[model] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json(out);
}
