// TEMPORARY debug — test Seedance 2.0 execution. Secret-gated.
// No ?task → create a 2.0 task. ?task=<id> → poll it.
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
  const task = u.searchParams.get("task");

  if (task) {
    const r = await fetch(`${URL_}/${encodeURIComponent(task)}`, { headers });
    return NextResponse.json({ status: r.status, raw: await r.json() });
  }

  const r = await fetch(URL_, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "dreamina-seedance-2-0-260128",
      content: [{ type: "text", text: "a calm ocean at sunset, cinematic" }],
      ratio: "16:9",
      resolution: "720p",
      duration: 5,
      generate_audio: true,
    }),
  });
  return NextResponse.json({ status: r.status, raw: await r.json() });
}
