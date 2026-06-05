// TEMPORARY debug — re-test BytePlus model activation. Secret-gated. DELETE after.
import { NextResponse } from "next/server";
import { createBytePlusTask } from "@/lib/byteplus-client";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const out: Record<string, unknown> = {};
  for (const engineKey of ["seedance2_byteplus", "seedance2_fast_byteplus"]) {
    try {
      const taskId = await createBytePlusTask({
        engineKey,
        prompt: "A calm ocean at sunset, slow cinematic camera move.",
        duration: 5,
        aspectRatio: "16:9",
      });
      out[engineKey] = { ok: true, taskId };
    } catch (e) {
      out[engineKey] = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json(out);
}
