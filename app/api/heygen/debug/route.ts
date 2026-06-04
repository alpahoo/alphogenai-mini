// TEMPORARY debug — validate BytePlus Seedance create request. Secret-gated.
// DELETE after use.
import { NextResponse } from "next/server";
import { createBytePlusTask, getBytePlusTask } from "@/lib/byteplus-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const out: Record<string, unknown> = {};
  try {
    const taskId = await createBytePlusTask({
      engineKey: "seedance2_byteplus",
      prompt: "A calm ocean at sunset, slow cinematic camera move.",
      duration: 5,
      aspectRatio: "16:9",
    });
    out.create = { ok: true, taskId };
    // One immediate poll to confirm the status endpoint works.
    try {
      const t = await getBytePlusTask(taskId);
      out.poll = t;
    } catch (e) {
      out.poll = { error: e instanceof Error ? e.message : String(e) };
    }
  } catch (e) {
    out.create = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return NextResponse.json(out);
}
