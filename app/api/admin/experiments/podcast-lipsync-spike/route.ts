import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/flags";
import {
  listAvatars,
  listVoices,
  createAvatarVideo,
  getHeyGenTask,
  createLipsync,
  getLipsyncTask,
} from "@/lib/heygen-client";

/**
 * EXPERIMENTAL — T-1142 podcast lip-sync spike. NOT a product feature.
 *
 * Admin-gated, no UI, no DB. Multi-step (driven step-by-step from outside to
 * avoid serverless timeouts): pick a stock avatar/voice → generate one short base
 * clip (createAvatarVideo) → lip-sync our real TTS audio onto it (createLipsync,
 * precision) → poll. Used once to measure quality/cost/time/visual-fit, then
 * this route is removed (see docs/product/podcast-real-video-duo-spec.md §10).
 *
 * POST body: { step: 'avatars' | 'voices' | 'base' | 'poll_base' | 'lipsync' | 'poll_lipsync', ... }
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const step = body.step;
  const t0 = Date.now();
  try {
    switch (step) {
      case "avatars": {
        const avatars = await listAvatars();
        return NextResponse.json({ elapsedMs: Date.now() - t0, avatars: avatars.slice(0, 10) });
      }
      case "voices": {
        const voices = await listVoices();
        return NextResponse.json({ elapsedMs: Date.now() - t0, voices: voices.slice(0, 10) });
      }
      case "base": {
        const { avatarId, voiceId, scriptText } = body;
        if (!avatarId || !voiceId) return NextResponse.json({ error: "avatarId + voiceId required" }, { status: 400 });
        const task = await createAvatarVideo({
          avatarId,
          voiceId,
          scriptText: scriptText || "Hey, welcome to the show. Let's get into it today.",
          aspectRatio: "16:9",
          resolution: "720p",
        });
        return NextResponse.json({ elapsedMs: Date.now() - t0, videoId: task.taskId, status: task.status });
      }
      case "poll_base": {
        if (!body.videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
        const r = await getHeyGenTask(body.videoId);
        return NextResponse.json({ elapsedMs: Date.now() - t0, ...r });
      }
      case "lipsync": {
        const { baseClipUrl, audioUrl, endTimeSeconds } = body;
        if (!baseClipUrl || !audioUrl) return NextResponse.json({ error: "baseClipUrl + audioUrl required" }, { status: 400 });
        const id = await createLipsync(baseClipUrl, audioUrl, "precision", endTimeSeconds);
        return NextResponse.json({ elapsedMs: Date.now() - t0, lipsyncId: id });
      }
      case "poll_lipsync": {
        if (!body.lipsyncId) return NextResponse.json({ error: "lipsyncId required" }, { status: 400 });
        const r = await getLipsyncTask(body.lipsyncId);
        return NextResponse.json({ elapsedMs: Date.now() - t0, ...r });
      }
      default:
        return NextResponse.json({ error: "unknown step" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
