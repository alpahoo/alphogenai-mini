// TEMPORARY debug — poll a Seedance 1.5 Pro task for usage. Secret-gated.
import { NextResponse } from "next/server";

const URL_ = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const taskId = u.searchParams.get("task") || "cgt-20260605091423-bjwhh";
  const r = await fetch(`${URL_}/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${process.env.BYTEPLUS_ARK_API_KEY ?? ""}` },
  });
  const data = await r.json();
  return NextResponse.json({ status: r.status, raw: data });
}
