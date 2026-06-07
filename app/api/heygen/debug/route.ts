// TEMPORARY debug — test asset:// with a real asset id. Secret-gated.
import { NextResponse } from "next/server";

const URL_ = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";
const ASSET = "asset://asset-20260607223134-mt4g5";

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
      content: [
        {
          type: "text",
          text: "Cinematic medium close-up of the person in image 1, sitting in a warm 1930s living room, golden hour light, 35mm film look.",
        },
        { type: "image_url", image_url: { url: ASSET }, role: "reference_image" },
      ],
      ratio: "16:9",
      resolution: "720p",
      duration: 5,
      generate_audio: false,
    }),
  });
  return NextResponse.json({ status: r.status, raw: await r.json() });
}
