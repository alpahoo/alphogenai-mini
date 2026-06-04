// TEMPORARY debug — test which avatar id format Avatar Shots accepts.
// Secret-gated. DELETE after use.
import { NextResponse } from "next/server";
import { createAvatarShotsVideo } from "@/lib/heygen-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const candidates: Record<string, string> = {
    v3_avatar_id: "7c87af6ea71b4f67b30d4bd8b813ed53", // digitalpaho v3 avatar look
    talking_photo_id: "4c262fb93bf74b89b158afef962b46f5", // Lady2 talking_photo look
    group_id: "916e371d494543faa938945258cb1719", // digitalpaho group
  };

  const out: Record<string, unknown> = {};
  for (const [label, id] of Object.entries(candidates)) {
    try {
      const t = await createAvatarShotsVideo({
        avatarId: id,
        scenePrompt: "A person sitting calmly in a warm living room, cinematic.",
        durationSeconds: 4,
        resolution: "1080p",
        aspectRatio: "16:9",
      });
      out[label] = { ok: true, taskId: t.taskId };
    } catch (e) {
      out[label] = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json(out);
}
