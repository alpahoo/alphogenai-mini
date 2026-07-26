import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  pollNativePresenterAnimation,
  startNativePresenterAnimation,
} from "@/lib/video-presenter-native-animation-provider";
import {
  NATIVE_PRESENTER_ANIMATION_BUCKET,
  NATIVE_PRESENTER_ANIMATION_VERSION,
  nativeAnimationAudioExtension,
  toPublicNativePresenterAnimation,
  validateNativeAnimationAudio,
  type NativePresenterAnimationRow,
} from "@/lib/video-presenter-native-animation";
import { NATIVE_PRESENTER_BASE_BUCKET } from "@/lib/video-presenter-native";

export const maxDuration = 30;

const SELECT =
  "id,user_id,native_base_id,audio_path,audio_mime,audio_size_bytes,audio_sha256,output_video_path,output_duration_seconds,status,provider_task_id,animation_version,error_code,started_at,completed_at,deleted_at,created_at,updated_at";

function publicRow(row: NativePresenterAnimationRow) {
  return toPublicNativePresenterAnimation(row);
}

async function loadOwnedAnimation(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  id: string,
) {
  const { data, error } = await service
    .from("user_presenter_native_animations")
    .select(SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .neq("status", "removed")
    .maybeSingle();
  if (error) throw new Error("native_animation_read_failed");
  return data as NativePresenterAnimationRow | null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "Missing animation." }, { status: 400 });
    const service = createServiceClient();
    const row = await loadOwnedAnimation(service, user.id, id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ animation: publicRow(row) });
  } catch (error) {
    console.error("GET /api/presenters/native-animation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "prepare";
    const service = createServiceClient();

    if (action === "prepare") {
      const nativeBaseId =
        typeof body.nativeBaseId === "string" ? body.nativeBaseId : "";
      const audio = body.audio && typeof body.audio === "object" ? body.audio : {};
      if (!nativeBaseId) {
        return NextResponse.json({ error: "Choose a ready video presenter." }, { status: 400 });
      }
      const audioError = validateNativeAnimationAudio(audio);
      if (audioError) return NextResponse.json({ error: audioError }, { status: 400 });

      const { data: nativeBase, error: baseError } = await service
        .from("user_presenter_native_bases")
        .select("id,user_id,status,normalized_video_path")
        .eq("id", nativeBaseId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (baseError) {
        return NextResponse.json({ error: "Could not load the presenter." }, { status: 500 });
      }
      if (!nativeBase) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (nativeBase.status !== "ready" || !nativeBase.normalized_video_path) {
        return NextResponse.json(
          { error: "The reusable presenter is still being prepared." },
          { status: 409 },
        );
      }

      const audioMime = String(audio.type).toLowerCase();
      const audioSize = Number(audio.size);
      const audioSha256 = String(audio.sha256).toLowerCase();
      const { data: existing, error: existingError } = await service
        .from("user_presenter_native_animations")
        .select(SELECT)
        .eq("user_id", user.id)
        .eq("native_base_id", nativeBaseId)
        .eq("audio_sha256", audioSha256)
        .eq("animation_version", NATIVE_PRESENTER_ANIMATION_VERSION)
        .neq("status", "removed")
        .maybeSingle();
      if (existingError) {
        return NextResponse.json({ error: "Could not prepare the animation." }, { status: 500 });
      }

      let row = existing as NativePresenterAnimationRow | null;
      if (!row) {
        const id = randomUUID();
        const audioPath = `${user.id}/${id}/speech.${nativeAnimationAudioExtension(audioMime)}`;
        const { data: inserted, error: insertError } = await service
          .from("user_presenter_native_animations")
          .insert({
            id,
            user_id: user.id,
            native_base_id: nativeBaseId,
            audio_path: audioPath,
            audio_mime: audioMime,
            audio_size_bytes: audioSize,
            audio_sha256: audioSha256,
            output_video_path: `${user.id}/${id}/animated.mp4`,
            status: "uploading",
            animation_version: NATIVE_PRESENTER_ANIMATION_VERSION,
          })
          .select(SELECT)
          .single();
        if (insertError || !inserted) {
          return NextResponse.json({ error: "Could not prepare the animation." }, { status: 500 });
        }
        row = inserted as NativePresenterAnimationRow;
      }

      if (row.status !== "uploading") {
        return NextResponse.json({ animation: publicRow(row), reused: true });
      }
      const { data: signed, error: signedError } = await service.storage
        .from(NATIVE_PRESENTER_ANIMATION_BUCKET)
        .createSignedUploadUrl(row.audio_path, { upsert: true });
      if (signedError || !signed) {
        return NextResponse.json({ error: "Could not prepare the private audio upload." }, { status: 500 });
      }
      return NextResponse.json({
        animation: publicRow(row),
        upload: {
          bucket: NATIVE_PRESENTER_ANIMATION_BUCKET,
          path: row.audio_path,
          token: signed.token,
        },
        reused: Boolean(existing),
      });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Missing animation." }, { status: 400 });
    const row = await loadOwnedAnimation(service, user.id, id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "submit") {
      if (["ready", "processing", "needs_review"].includes(row.status)) {
        return NextResponse.json({ animation: publicRow(row), reused: true });
      }
      if (!["uploading", "uploaded", "failed"].includes(row.status)) {
        return NextResponse.json({ error: "This animation cannot be started." }, { status: 409 });
      }
      const { data: audioBlob, error: audioReadError } = await service.storage
        .from(NATIVE_PRESENTER_ANIMATION_BUCKET)
        .download(row.audio_path);
      if (audioReadError || !audioBlob) {
        return NextResponse.json({ error: "The speech audio has not finished uploading." }, { status: 409 });
      }
      const audioBytes = Buffer.from(await audioBlob.arrayBuffer());
      const uploadedSha256 = createHash("sha256").update(audioBytes).digest("hex");
      if (
        audioBytes.byteLength !== row.audio_size_bytes
        || uploadedSha256 !== row.audio_sha256
      ) {
        return NextResponse.json(
          { error: "The speech audio could not be verified. Upload it again." },
          { status: 400 },
        );
      }
      const { data: nativeBase, error: baseError } = await service
        .from("user_presenter_native_bases")
        .select("id,user_id,status,normalized_video_path")
        .eq("id", row.native_base_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (baseError) {
        return NextResponse.json({ error: "Could not load the presenter." }, { status: 500 });
      }
      if (!nativeBase || nativeBase.status !== "ready" || !nativeBase.normalized_video_path) {
        return NextResponse.json({ error: "The reusable presenter is not ready." }, { status: 409 });
      }

      const { data: claimed, error: claimError } = await service
        .from("user_presenter_native_animations")
        .update({
          status: "processing",
          provider_task_id: null,
          error_code: null,
          started_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("user_id", user.id)
        .in("status", ["uploading", "uploaded", "failed"])
        .select(SELECT)
        .maybeSingle();
      if (claimError) {
        return NextResponse.json({ error: "Could not reserve the animation." }, { status: 500 });
      }
      if (!claimed) {
        const current = await loadOwnedAnimation(service, user.id, row.id);
        return NextResponse.json({
          animation: current ? publicRow(current) : publicRow(row),
          reused: true,
        });
      }

      const [videoSigned, audioSigned] = await Promise.all([
        service.storage
          .from(NATIVE_PRESENTER_BASE_BUCKET)
          .createSignedUrl(nativeBase.normalized_video_path, 15 * 60),
        service.storage
          .from(NATIVE_PRESENTER_ANIMATION_BUCKET)
          .createSignedUrl(row.audio_path, 15 * 60),
      ]);
      if (
        videoSigned.error
        || audioSigned.error
        || !videoSigned.data?.signedUrl
        || !audioSigned.data?.signedUrl
      ) {
        await service
          .from("user_presenter_native_animations")
          .update({ status: "uploaded", error_code: "private_media_unavailable" })
          .eq("id", row.id)
          .eq("user_id", user.id)
          .eq("status", "processing");
        return NextResponse.json({ error: "Could not read the private animation media." }, { status: 500 });
      }

      let taskId: string;
      try {
        taskId = await startNativePresenterAnimation({
          videoUrl: videoSigned.data.signedUrl,
          audioUrl: audioSigned.data.signedUrl,
          outputPath: row.output_video_path!,
        });
      } catch (error) {
        console.error("[native-animation] start failed:", { id: row.id, error });
        await service
          .from("user_presenter_native_animations")
          .update({ status: "uploaded", error_code: "animation_start_failed" })
          .eq("id", row.id)
          .eq("user_id", user.id)
          .eq("status", "processing");
        return NextResponse.json({ error: "Could not start the presenter animation." }, { status: 502 });
      }
      const { data: saved, error: saveError } = await service
        .from("user_presenter_native_animations")
        .update({ provider_task_id: taskId, status: "processing", error_code: null })
        .eq("id", row.id)
        .eq("user_id", user.id)
        .eq("status", "processing")
        .select(SELECT)
        .maybeSingle();
      if (saveError || !saved) {
        await service
          .from("user_presenter_native_animations")
          .update({ status: "needs_review", error_code: "task_tracking_incomplete" })
          .eq("id", row.id)
          .eq("user_id", user.id)
          .eq("status", "processing");
        return NextResponse.json(
          { error: "Animation started but tracking needs support. Do not retry." },
          { status: 502 },
        );
      }
      return NextResponse.json({ animation: publicRow(saved as NativePresenterAnimationRow), reused: false });
    }

    if (action === "poll") {
      if (row.status !== "processing" || !row.provider_task_id) {
        return NextResponse.json({ animation: publicRow(row) });
      }
      const result = await pollNativePresenterAnimation(row.provider_task_id);
      if (result.status === "processing") {
        return NextResponse.json({ animation: publicRow(row) });
      }
      if (result.status === "failed") {
        const { data: failed, error: failedError } = await service
          .from("user_presenter_native_animations")
          .update({ status: "failed", error_code: "animation_failed" })
          .eq("id", row.id)
          .eq("user_id", user.id)
          .eq("status", "processing")
          .select(SELECT)
          .maybeSingle();
        if (failedError || !failed) {
          return NextResponse.json(
            { error: "Could not save the failed animation state." },
            { status: 500 },
          );
        }
        return NextResponse.json({ animation: publicRow((failed ?? row) as NativePresenterAnimationRow) });
      }
      if (result.outputPath !== row.output_video_path) {
        const { error: mismatchError } = await service
          .from("user_presenter_native_animations")
          .update({ status: "needs_review", error_code: "output_path_mismatch" })
          .eq("id", row.id)
          .eq("user_id", user.id)
          .eq("status", "processing");
        if (mismatchError) {
          return NextResponse.json(
            { error: "Could not save the animation review state." },
            { status: 500 },
          );
        }
        return NextResponse.json({ error: "Animation output needs support." }, { status: 502 });
      }
      if (
        result.durationSeconds !== null
        && (
          !Number.isFinite(result.durationSeconds)
          || result.durationSeconds < 0.5
          || result.durationSeconds > 8.5
        )
      ) {
        const { error: durationError } = await service
          .from("user_presenter_native_animations")
          .update({ status: "needs_review", error_code: "output_duration_invalid" })
          .eq("id", row.id)
          .eq("user_id", user.id)
          .eq("status", "processing");
        if (durationError) {
          return NextResponse.json(
            { error: "Could not save the animation review state." },
            { status: 500 },
          );
        }
        return NextResponse.json({ error: "Animation output needs support." }, { status: 502 });
      }
      const { data: ready, error: readyError } = await service
        .from("user_presenter_native_animations")
        .update({
          status: "ready",
          error_code: null,
          output_duration_seconds: result.durationSeconds,
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("user_id", user.id)
        .eq("status", "processing")
        .select(SELECT)
        .maybeSingle();
      if (readyError || !ready) {
        return NextResponse.json({ error: "Could not save the completed animation." }, { status: 500 });
      }
      return NextResponse.json({ animation: publicRow(ready as NativePresenterAnimationRow) });
    }

    if (action === "download") {
      if (row.status !== "ready" || !row.output_video_path) {
        return NextResponse.json(
          { error: "The animation is not ready to download." },
          { status: 409 },
        );
      }
      const { data: signed, error: signedError } = await service.storage
        .from(NATIVE_PRESENTER_ANIMATION_BUCKET)
        .createSignedUrl(row.output_video_path, 10 * 60);
      if (signedError || !signed?.signedUrl) {
        return NextResponse.json(
          { error: "Could not prepare the private animation download." },
          { status: 500 },
        );
      }
      return NextResponse.json({
        animation: publicRow(row),
        downloadUrl: signed.signedUrl,
        expiresIn: 10 * 60,
      });
    }

    if (action === "remove") {
      if (row.status === "processing" || row.status === "needs_review") {
        return NextResponse.json({ error: "Wait for the animation to finish before deleting it." }, { status: 409 });
      }
      const paths = [row.audio_path, row.output_video_path].filter(
        (path): path is string => Boolean(path),
      );
      if (paths.length) {
        const { error: removeError } = await service.storage
          .from(NATIVE_PRESENTER_ANIMATION_BUCKET)
          .remove(paths);
        if (removeError) {
          return NextResponse.json({ error: "Could not remove the private animation media." }, { status: 500 });
        }
      }
      const { error: updateError } = await service
        .from("user_presenter_native_animations")
        .update({
          status: "removed",
          deleted_at: new Date().toISOString(),
          provider_task_id: null,
          error_code: null,
        })
        .eq("id", row.id)
        .eq("user_id", user.id)
        .not("status", "in", "(processing,needs_review)");
      if (updateError) {
        return NextResponse.json({ error: "Could not remove the animation." }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/presenters/native-animation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
