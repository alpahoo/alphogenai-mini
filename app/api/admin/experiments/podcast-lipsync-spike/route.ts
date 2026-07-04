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
      case "gen_portrait": {
        // T-1143d: probe BytePlus ModelArk Seedream T2I → rehost to R2 staging.
        // model + prompt from body so we can discover the callable model id
        // without redeploying (failed model ids error out, no charge).
        const model = typeof body.model === "string" ? body.model : "";
        const prompt = typeof body.prompt === "string" ? body.prompt : "";
        if (!model || !prompt) return NextResponse.json({ error: "model + prompt required" }, { status: 400 });
        const arkBase = process.env.BYTEPLUS_BASE_URL || "https://ark.ap-southeast.bytepluses.com";
        const arkKey = process.env.BYTEPLUS_ARK_API_KEY || "";
        const payload: Record<string, unknown> = {
          model,
          prompt,
          size: typeof body.size === "string" ? body.size : "1024x1024",
          response_format: "url",
          n: 1,
        };
        if (typeof body.negative_prompt === "string") payload.negative_prompt = body.negative_prompt;
        if (body.watermark === false) payload.watermark = false;
        const gen = await fetch(`${arkBase}/api/v3/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${arkKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(50_000),
        });
        const genJson = await gen.json().catch(() => ({}));
        if (!gen.ok) {
          return NextResponse.json({ elapsedMs: Date.now() - t0, ark_status: gen.status, ark_error: genJson }, { status: 200 });
        }
        const first = Array.isArray(genJson.data) ? genJson.data[0] : undefined;
        const srcUrl = first?.url as string | undefined;
        const b64 = first?.b64_json as string | undefined;
        let buffer: Buffer | null = null;
        let srcInfo = "";
        if (srcUrl) {
          const dl = await fetch(srcUrl, { signal: AbortSignal.timeout(30_000) });
          if (!dl.ok) return NextResponse.json({ error: `download failed ${dl.status}`, srcUrl }, { status: 200 });
          buffer = Buffer.from(await dl.arrayBuffer());
          srcInfo = srcUrl.slice(0, 80);
        } else if (b64) {
          buffer = Buffer.from(b64, "base64");
          srcInfo = "b64";
        }
        if (!buffer || buffer.length < 1000) {
          return NextResponse.json({ error: "no image in response", raw: genJson }, { status: 200 });
        }
        const label = typeof body.label === "string" ? body.label.replace(/[^a-z0-9-]/gi, "_").slice(0, 40) : "portrait";
        const key = `experiments/photoreal-personas/${label}-${randomUUID()}.png`;
        const url = await uploadBufferToR2(buffer, key, "image/png");
        return NextResponse.json({ elapsedMs: Date.now() - t0, ark_status: gen.status, src: srcInfo, r2_url: url, bytes: buffer.length, usage: genJson.usage });
      }
      case "normalize_jpeg": {
        // T-1143d: fetch a staging portrait (PNG), re-encode to a stable 1024 JPEG
        // (HeyGen photo-avatar needs JPEG with readable dimensions), upload to a
        // PERMANENT catalog path on R2. Returns the permanent URL.
        const src = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
        const slug = typeof body.slug === "string" ? body.slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 60) : "";
        if (!src || !slug) return NextResponse.json({ error: "sourceUrl + slug required" }, { status: 400 });
        const dl = await fetch(src, { signal: AbortSignal.timeout(30_000) });
        if (!dl.ok) return NextResponse.json({ error: `download failed ${dl.status}` }, { status: 200 });
        const inBuf = Buffer.from(await dl.arrayBuffer());
        const sharp = (await import("sharp")).default;
        const jpeg = await sharp(inBuf).resize(1024, 1024, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
        const key = `podcast/personas-catalog/${slug}.jpg`;
        const url = await uploadBufferToR2(jpeg, key, "image/jpeg");
        return NextResponse.json({ elapsedMs: Date.now() - t0, r2_url: url, key, bytes: jpeg.length });
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
      case "raw_lipsync": {
        // Diagnostic-only (no spend): return HeyGen's raw lipsync task JSON so we
        // can read the real failure reason (our client normalizes it away).
        if (!body.lipsyncId) return NextResponse.json({ error: "lipsyncId required" }, { status: 400 });
        const res = await fetch(`https://api.heygen.com/v3/lipsyncs/${body.lipsyncId}`, {
          headers: { "X-Api-Key": process.env.HEYGEN_API_KEY || "", Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({ elapsedMs: Date.now() - t0, http: res.status, raw: data });
      }
      default:
        return NextResponse.json({ error: "unknown step" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
