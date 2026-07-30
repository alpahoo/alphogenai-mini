import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { readProductPageBrief } from "@/lib/native-product-ad";
import { NATIVE_PRESENTER_BASE_BUCKET } from "@/lib/video-presenter-native";
import { buildUGCShotPack } from "@/lib/ugc-shot-pack";
import { BytePlusUGCShotProvider } from "@/lib/providers/byteplus-ugc-shot-provider";
import {
  UGC_SHOT_PACK_SIZE,
  UGC_SHOT_PACK_VERSION,
  type UGCShotTask,
} from "@/lib/ugc-shot-provider";
import { downloadAndUploadToR2, uploadBufferToR2 } from "@/lib/r2";
import { buildRevideoProductAdManifest } from "@/lib/revideo-product-ad";
import { buildDirectedProductAdCopy } from "@/lib/product-ad-directed-copy";
import { generateVoiceover, isTTSAvailable } from "@/lib/tts";
import {
  getRevideoProductAd,
  isRevideoWorkerConfigured,
  startRevideoProductAd,
} from "@/lib/revideo-worker-client";

export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredShotTask {
  shotId: string;
  role: string;
  providerTaskId: string;
}

interface StoredShotOutput {
  status: "ready" | "failed";
  videoUrl?: string;
  errorCode?: string;
  usageUnits?: number;
}

interface UGCShotPackState {
  capability: "ugc_shot_pack";
  version: string;
  url: string;
  product: {
    title: string;
    description: string;
    imageUrl: string | null;
    imageUrls: string[];
    hostname: string;
  };
  shots: Array<{
    id: string;
    role: string;
    prompt: string;
    durationSeconds: number;
  }>;
  tasks: StoredShotTask[];
  outputs: Record<string, StoredShotOutput>;
  nativeBaseId: string | null;
  copy: {
    captions: [string, string, string];
    cta: string;
  };
  voiceoverUrl: string;
  editTaskId?: string;
  editVideoUrl?: string;
}

function buildCachedEditManifest(state: UGCShotPackState) {
  const fallbackCopy = buildDirectedProductAdCopy(state.product, "French (France)");
  return buildRevideoProductAdManifest({
    productTitle: state.product.title,
    productDescription: state.product.description,
    productImageUrl: state.product.imageUrl ?? undefined,
    voiceoverUrl: state.voiceoverUrl || undefined,
    captions: state.copy?.captions ?? fallbackCopy.captions,
    cta: state.copy?.cta ?? fallbackCopy.cta,
    shots: state.shots.map((shot) => ({
      id: shot.id,
      role: shot.role as "creator_hook" | "product_demo" | "lifestyle_cta",
      durationSeconds: shot.durationSeconds,
      videoUrl: state.outputs?.[shot.id]?.videoUrl ?? "",
    })),
  });
}

async function signPresenterVideo(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  nativeBaseId: string
) {
  const { data: base, error } = await service
    .from("user_presenter_native_bases")
    .select("id,status,normalized_video_path")
    .eq("id", nativeBaseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("presenter_lookup_failed");
  if (!base || base.status !== "ready" || !base.normalized_video_path) {
    throw new Error("presenter_not_ready");
  }

  const { data: signed, error: signedError } = await service.storage
    .from(NATIVE_PRESENTER_BASE_BUCKET)
    .createSignedUrl(base.normalized_video_path, 900);
  if (signedError || !signed?.signedUrl) throw new Error("presenter_sign_failed");
  return signed.signedUrl;
}

async function startPack(
  user: { id: string; email: string },
  body: Record<string, unknown>
) {
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const nativeBaseId =
    typeof body.nativeBaseId === "string" && UUID_RE.test(body.nativeBaseId)
      ? body.nativeBaseId
      : "";
  const aspectRatio =
    body.aspectRatio === "1:1" || body.aspectRatio === "16:9" ? body.aspectRatio : "9:16";
  const language =
    typeof body.language === "string" && body.language.trim()
      ? body.language.trim().slice(0, 80)
      : "French (France)";
  const verifiedAssetIds = Array.isArray(body.verifiedAssetIds)
    ? body.verifiedAssetIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const voice =
    typeof body.voice === "string" && body.voice.trim()
      ? body.voice.trim().slice(0, 100)
      : "rachel";

  if (!/^https?:\/\/.+\..+/.test(url) || url.length > 2000) {
    return NextResponse.json({ error: "A valid product URL is required." }, { status: 400 });
  }

  const service = createServiceClient();
  let presenterVideoUrl: string | null = null;
  if (nativeBaseId) {
    try {
      presenterVideoUrl = await signPresenterVideo(service, user.id, nativeBaseId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "presenter_not_ready";
      const status = message === "presenter_not_ready" ? 409 : 500;
      return NextResponse.json({ error: "The reusable presenter clip is not ready." }, { status });
    }
  }

  const brief = await readProductPageBrief(url);
  if (!brief.imageUrls.length) {
    return NextResponse.json(
      { error: "No usable product image was found on this page." },
      { status: 422 }
    );
  }

  if (!isTTSAvailable()) {
    return NextResponse.json(
      { error: "The directed edit voice service is not configured." },
      { status: 503 }
    );
  }

  const copy = buildDirectedProductAdCopy(brief, language);
  let voiceoverUrl: string;
  try {
    const tts = await generateVoiceover({
      text: copy.voiceover,
      voice,
      format: "mp3",
    });
    voiceoverUrl = await uploadBufferToR2(
      Buffer.from(tts.audio),
      `audio/ugc-shot-pack/${user.id}/${randomUUID()}.mp3`,
      tts.content_type
    );
  } catch (error) {
    console.error("[ugc-shot-pack] deterministic voiceover failed", error);
    return NextResponse.json(
      { error: "The directed edit voice-over could not be prepared." },
      { status: 502 }
    );
  }

  const shots = buildUGCShotPack({
    brief,
    aspectRatio,
    language,
    verifiedAssetIds,
    presenterVideo: presenterVideoUrl
      ? { role: "character_face", url: presenterVideoUrl, mime_type: "video/mp4" }
      : null,
  });
  const initialState: UGCShotPackState = {
    capability: "ugc_shot_pack",
    version: UGC_SHOT_PACK_VERSION,
    url,
    product: brief,
    shots: shots.map(({ id, role, prompt, durationSeconds }) => ({
      id,
      role,
      prompt,
      durationSeconds,
    })),
    tasks: [],
    outputs: {},
    nativeBaseId: nativeBaseId || null,
    copy: { captions: copy.captions, cta: copy.cta },
    voiceoverUrl,
  };

  const { data: job, error: jobError } = await service
    .from("jobs")
    .insert({
      user_id: user.id,
      prompt: url,
      status: "in_progress",
      engine_used: "native_product_ad",
      current_stage: "ugc_shots_generating",
      aspect_ratio: aspectRatio,
      target_duration_seconds: shots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
      app_state: initialState,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Could not reserve the UGC shot pack." }, { status: 500 });
  }

  const provider = new BytePlusUGCShotProvider();
  const tasks: StoredShotTask[] = [];
  try {
    for (const shot of shots) {
      const task = await provider.start(shot);
      tasks.push({ shotId: shot.id, role: shot.role, providerTaskId: task.providerTaskId });
      const { error: saveError } = await service
        .from("jobs")
        .update({ app_state: { ...initialState, tasks } })
        .eq("id", job.id);
      if (saveError) throw new Error("task_state_save_failed");
    }
  } catch (error) {
    console.error(`[ugc-shot-pack] start failed job=${job.id}`, error);
    await service
      .from("jobs")
      .update({
        status: tasks.length ? "in_progress" : "failed",
        current_stage: tasks.length ? "ugc_shots_partial" : "failed",
        error_message: "The UGC shot pack could not be started completely.",
        app_state: { ...initialState, tasks },
      })
      .eq("id", job.id);
    return NextResponse.json(
      {
        error: "The UGC shot pack could not be started completely.",
        jobId: job.id,
        started: tasks.length,
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { success: true, jobId: job.id, status: "processing", shots: tasks.length },
    { status: 202 }
  );
}

async function pollPack(
  user: { id: string },
  body: Record<string, unknown>
) {
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: job, error } = await service
    .from("jobs")
    .select("id,status,app_state,updated_at")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const state = job.app_state as UGCShotPackState | null;
  if (state?.capability !== "ugc_shot_pack" || !Array.isArray(state.tasks)) {
    return NextResponse.json({ error: "This is not a UGC shot-pack job." }, { status: 400 });
  }

  const provider = new BytePlusUGCShotProvider();
  const outputs = { ...(state.outputs ?? {}) };
  for (const stored of state.tasks) {
    if (outputs[stored.shotId]?.status === "ready") continue;
    const task: UGCShotTask = {
      shotId: stored.shotId,
      providerTaskId: stored.providerTaskId,
      status: "processing",
    };
    const result = await provider.poll(task);
    if (result.status === "ready" && result.videoUrl) {
      const permanentUrl = await downloadAndUploadToR2(
        result.videoUrl,
        `videos/ugc-shot-pack/${job.id}/${stored.shotId}-${randomUUID()}.mp4`
      );
      outputs[stored.shotId] = {
        status: "ready",
        videoUrl: permanentUrl,
        usageUnits: result.usageUnits,
      };
    } else if (result.status === "failed") {
      outputs[stored.shotId] = {
        status: "failed",
        errorCode: result.errorCode,
        usageUnits: result.usageUnits,
      };
    }
  }

  const ready = Object.values(outputs).filter((output) => output.status === "ready").length;
  const failed = Object.values(outputs).filter((output) => output.status === "failed").length;
  const processing = Math.max(0, state.tasks.length - ready - failed);
  const missing = Math.max(0, UGC_SHOT_PACK_SIZE - state.tasks.length);
  const finished = processing === 0;
  const completePack =
    finished && failed === 0 && missing === 0 && ready === UGC_SHOT_PACK_SIZE;
  let finalStatus = completePack ? "done" : finished ? "failed" : "in_progress";
  const editManifest = completePack
    ? buildCachedEditManifest({ ...state, outputs })
    : null;
  let nextState: UGCShotPackState = { ...state, outputs };
  let finalVideoUrl = state.editVideoUrl;
  if (completePack && editManifest && isRevideoWorkerConfigured()) {
    if (state.editVideoUrl) {
      finalStatus = "done";
    } else {
      try {
        if (!state.editTaskId) {
          const started = await startRevideoProductAd(job.id, editManifest);
          nextState = { ...nextState, editTaskId: started.requestId };
          finalStatus = "in_progress";
        } else {
          const edit = await getRevideoProductAd(state.editTaskId);
          if (edit.status === "done" && edit.videoUrl) {
            const permanentUrl = await downloadAndUploadToR2(
              edit.videoUrl,
              `videos/ugc-directed-edit/${job.id}/${state.editTaskId}.mp4`
            );
            finalVideoUrl = permanentUrl;
            nextState = { ...nextState, editVideoUrl: permanentUrl };
            finalStatus = "done";
          } else if (edit.status === "failed") {
            finalStatus = "failed";
          } else {
            finalStatus = "in_progress";
          }
        }
      } catch (error) {
        console.error(`[ugc-shot-pack] edit orchestration failed job=${job.id}`, error);
        if (
          error instanceof Error &&
          error.message === "revideo_worker_request_not_found"
        ) {
          try {
            const restarted = await startRevideoProductAd(job.id, editManifest);
            nextState = { ...nextState, editTaskId: restarted.requestId };
          } catch (restartError) {
            console.error(`[ugc-shot-pack] edit restart failed job=${job.id}`, restartError);
          }
        }
        finalStatus = "in_progress";
      }
    }
  }
  const { data: updatedJob, error: updateError } = await service
    .from("jobs")
    .update({
      status: finalStatus,
      current_stage:
        finalStatus === "done"
          ? finalVideoUrl
            ? "ugc_edit_ready"
            : "ugc_shots_ready"
          : finalStatus === "failed"
            ? "failed"
            : completePack
              ? "ugc_edit_rendering"
              : "ugc_shots_generating",
      video_url: finalVideoUrl ?? null,
      error_message:
        failed || missing
          ? `${failed + missing} UGC shot(s) unavailable.`
          : null,
      app_state: nextState,
    })
    .eq("id", job.id)
    .eq("updated_at", job.updated_at)
    .select("id")
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: "Could not save UGC shot progress." }, { status: 500 });
  }
  if (!updatedJob) {
    return NextResponse.json(
      { error: "UGC shot progress changed concurrently. Poll again." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    jobId: job.id,
    status: finalStatus,
    ready,
    failed,
    processing,
    missing,
    outputs,
    editManifest,
    videoUrl: finalVideoUrl,
  });
}

async function retryEdit(
  user: { id: string },
  body: Record<string, unknown>
) {
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: job, error } = await service
    .from("jobs")
    .select("id,app_state,updated_at")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const state = job.app_state as UGCShotPackState | null;
  if (state?.capability !== "ugc_shot_pack") {
    return NextResponse.json({ error: "This is not a UGC shot-pack job." }, { status: 400 });
  }
  const ready = Object.values(state.outputs ?? {}).filter(
    (output) => output.status === "ready" && output.videoUrl
  ).length;
  if (ready !== UGC_SHOT_PACK_SIZE) {
    return NextResponse.json(
      { error: "All three cached shots must be ready before rebuilding the edit." },
      { status: 409 }
    );
  }

  if (!isRevideoWorkerConfigured()) {
    return NextResponse.json({ error: "The assembly worker is not configured." }, { status: 503 });
  }

  let started;
  try {
    started = await startRevideoProductAd(job.id, buildCachedEditManifest(state));
  } catch (error) {
    console.error(`[ugc-shot-pack] cached edit restart failed job=${job.id}`, error);
    return NextResponse.json({ error: "Could not start the cached assembly." }, { status: 502 });
  }

  const nextState = {
    ...state,
    editTaskId: started.requestId,
  };
  delete nextState.editVideoUrl;
  const { data: updatedJob, error: updateError } = await service
    .from("jobs")
    .update({
      status: "in_progress",
      current_stage: "ugc_edit_rendering",
      video_url: null,
      error_message: null,
      app_state: nextState,
    })
    .eq("id", job.id)
    .eq("updated_at", job.updated_at)
    .select("id")
    .maybeSingle();
  if (updateError || !updatedJob) {
    return NextResponse.json({ error: "Could not restart the cached assembly." }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    jobId: job.id,
    status: "processing",
    requestId: started.requestId,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === "start") return startPack(auth.user, body);
  if (body.action === "poll") return pollPack(auth.user, body);
  if (body.action === "retry_edit") return retryEdit(auth.user, body);
  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
