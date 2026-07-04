import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/flags";
import { uploadBufferToR2 } from "@/lib/r2";
import {
  listAvatars,
  listOwnedAvatars,
  listVoices,
  createPhotoAvatar,
  createAvatarVideo,
  getHeyGenTask,
  createLipsync,
  getLipsyncTask,
} from "@/lib/heygen-client";
import { randomUUID } from "crypto";

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
        // Owned avatars only — listAvatars() pulls the whole public library and
        // times out. We'd animate our own looks anyway.
        const avatars = await listOwnedAvatars();
        return NextResponse.json({ elapsedMs: Date.now() - t0, avatars: avatars.slice(0, 10) });
      }
      case "avatars_all": {
        const avatars = await listAvatars();
        return NextResponse.json({ elapsedMs: Date.now() - t0, avatars: avatars.slice(0, 10) });
      }
      case "raw_avatars": {
        // Direct fetch with a generous timeout — the client's 15s abort is too
        // short for HeyGen's avatar list. Spike-only.
        const res = await fetch("https://api.heygen.com/v2/avatars", {
          headers: { "X-Api-Key": process.env.HEYGEN_API_KEY || "", Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        });
        const data = await res.json().catch(() => ({}));
        const root = data.data ?? data;
        const avatars = (root.avatars ?? []).slice(0, 8).map((a: Record<string, unknown>) => ({
          avatar_id: a.avatar_id ?? a.id, name: a.avatar_name ?? a.name,
        }));
        const talking = (root.talking_photos ?? []).slice(0, 5).map((a: Record<string, unknown>) => ({
          talking_photo_id: a.talking_photo_id ?? a.id, name: a.talking_photo_name ?? a.name,
        }));
        return NextResponse.json({ elapsedMs: Date.now() - t0, http: res.status, avatars, talking });
      }
      case "voices": {
        const voices = await listVoices();
        return NextResponse.json({ elapsedMs: Date.now() - t0, voices: voices.slice(0, 10) });
      }
      case "latest_audio": {
        // Admin-only spike helper: reuse a real podcast TTS clip without
        // exposing client tokens or generating new voice audio.
        const service = createServiceClient();
        const { data, error } = await service
          .from("podcast_segments")
          .select("id,podcast_id,speaker_id,text,audio_url,start_ms,end_ms,order_index,status")
          .eq("status", "ready")
          .not("audio_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(8);
        if (error) throw new Error(`latest_audio failed: ${error.message}`);
        return NextResponse.json({ elapsedMs: Date.now() - t0, segments: data ?? [] });
      }
      case "personas": {
        // Admin-only spike helper: list active personas and sign private
        // storage paths so HeyGen can fetch a portrait for this experiment.
        const service = createServiceClient();
        const { data, error } = await service
          .from("podcast_personas")
          .select("id,name,source_kind,portrait_path,thumb_path,status,user_id")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw new Error(`personas failed: ${error.message}`);
        const personas = [];
        for (const row of data ?? []) {
          const path = String(row.portrait_path ?? "");
          let imageUrl = path;
          if (path && !/^https?:\/\//i.test(path)) {
            const signed = await service.storage.from("podcast-personas").createSignedUrl(path, 60 * 60);
            imageUrl = signed.data?.signedUrl ?? "";
          }
          personas.push({
            id: row.id,
            name: row.name,
            source_kind: row.source_kind,
            catalog: row.user_id == null,
            imageUrl,
            thumb_path: row.thumb_path,
          });
        }
        return NextResponse.json({ elapsedMs: Date.now() - t0, personas });
      }
      case "photo_avatar": {
        // Turn a persona portrait into a photo avatar (the real T-1143 chain),
        // avoiding the slow avatar listing.
        if (!body.imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
        const pa = await createPhotoAvatar({ imageUrl: body.imageUrl, name: body.name || "spike" });
        return NextResponse.json({ elapsedMs: Date.now() - t0, avatarId: pa.avatarId, status: pa.status });
      }
      case "upload_image": {
        // Spike-only helper: upload a normalized portrait (usually JPEG) to R2
        // so HeyGen gets a stable public URL with readable dimensions.
        const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
        if (!dataUrl) return NextResponse.json({ error: "dataUrl required" }, { status: 400 });
        const comma = dataUrl.indexOf(",");
        const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length < 1000) return NextResponse.json({ error: "image too small" }, { status: 400 });
        if (buffer.length > 8_000_000) return NextResponse.json({ error: "image too large" }, { status: 400 });
        const contentType = body.contentType === "image/png" ? "image/png" : "image/jpeg";
        const ext = contentType === "image/png" ? "png" : "jpg";
        const key = `experiments/podcast-lipsync-spike/${randomUUID()}.${ext}`;
        const url = await uploadBufferToR2(buffer, key, contentType);
        return NextResponse.json({ elapsedMs: Date.now() - t0, url, key, bytes: buffer.length });
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
