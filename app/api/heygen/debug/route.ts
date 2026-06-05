// TEMPORARY debug — read raw BytePlus task to find the real token usage field.
import { NextResponse } from "next/server";

const URL_ = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const taskId = u.searchParams.get("task") || "cgt-20260605082126-xcqg5";
  try {
    const r = await fetch(`${URL_}/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${process.env.BYTEPLUS_ARK_API_KEY ?? ""}` },
    });
    const data = await r.json();
    return NextResponse.json({ status: r.status, raw: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
