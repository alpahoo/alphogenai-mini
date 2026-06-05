// TEMPORARY debug — find the activated Seedance 1.5 Pro model id. Secret-gated.
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
    "seedance-1-5-pro-251215",
    "seedance-1-5-pro-251201",
    "seedance-1-5-pro-251228",
    "seedance-1-5-pro-260128",
    "seedance-1-5-pro-250528",
    "seedance-1-5-pro",
    "seedance-1.5-pro",
    "bytedance-seedance-1-5-pro",
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
      out[model] = { status: r.status, body: txt.slice(0, 180) };
    } catch (e) {
      out[model] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json(out);
}
