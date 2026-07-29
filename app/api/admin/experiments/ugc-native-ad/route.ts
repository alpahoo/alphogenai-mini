import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { readProductPageBrief } from "@/lib/native-product-ad";
import { NATIVE_PRESENTER_BASE_BUCKET } from "@/lib/video-presenter-native";
import { buildUGCNativeAdSpec } from "@/lib/ugc-native-ad";
import { BytePlusUGCNativeAdProvider } from "@/lib/providers/byteplus-ugc-shot-provider";
import {
  UGC_NATIVE_AD_VERSION,
  type UGCNativeAdTask,
} from "@/lib/ugc-shot-provider";
import { downloadAndUploadToR2 } from "@/lib/r2";

export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UGCNativeAdState {
  capability: "ugc_native_ad";
  version: string;
  url: string;
  product: {
    title: string;
    description: string;
    imageUrl: string | null;
    imageUrls: string[];
    hostname: string;
  };
  prompt: string;
  nativeBaseId: string | null;
  task: {
    adId: string;
    providerTaskId: string;
  } | null;
  output: {
    status: "ready" | "failed";
    videoUrl?: string;
    errorCode?: string;
    usageUnits?: number;
  } | null;
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

async function startNativeAd(
  user: { id: string },
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
      return NextResponse.json(
        { error: "The reusable presenter clip is not ready." },
        { status: message === "presenter_not_ready" ? 409 : 500 }
      );
    }
  }

  const brief = await readProductPageBrief(url);
  if (!brief.imageUrls.length) {
    return NextResponse.json(
      { error: "No usable product image was found on this page." },
      { status: 422 }
    );
  }

  const spec = buildUGCNativeAdSpec({
    brief,
    aspectRatio,
    language,
    verifiedAssetIds,
    presenterVideo: presenterVideoUrl
      ? { role: "character_face", url: presenterVideoUrl, mime_type: "video/mp4" }
      : null,
  });
  const initialState: UGCNativeAdState = {
    capability: "ugc_native_ad",
    version: UGC_NATIVE_AD_VERSION,
    url,
    product: brief,
    prompt: spec.prompt,
    nativeBaseId: nativeBaseId || null,
    task: null,
    output: null,
  };

  const { data: job, error: jobError } = await service
    .from("jobs")
    .insert({
      user_id: user.id,
      prompt: url,
      status: "in_progress",
      engine_used: "native_product_ad",
      current_stage: "ugc_native_generating",
      aspect_ratio: aspectRatio,
      target_duration_seconds: spec.durationSeconds,
      app_state: initialState,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Could not reserve the native UGC ad." }, { status: 500 });
  }

  const provider = new BytePlusUGCNativeAdProvider();
  try {
    const task = await provider.start(spec);
    const nextState: UGCNativeAdState = {
      ...initialState,
      task: { adId: task.adId, providerTaskId: task.providerTaskId },
    };
    const { error: saveError } = await service
      .from("jobs")
      .update({ app_state: nextState })
      .eq("id", job.id);
    if (saveError) throw new Error("task_state_save_failed");
  } catch (error) {
    console.error(`[ugc-native-ad] start failed job=${job.id}`, error);
    await service
      .from("jobs")
      .update({
        status: "failed",
        current_stage: "failed",
        error_message: "The native UGC ad could not be started.",
      })
      .eq("id", job.id);
    return NextResponse.json(
      { error: "The native UGC ad could not be started.", jobId: job.id },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { success: true, jobId: job.id, status: "processing" },
    { status: 202 }
  );
}

async function pollNativeAd(user: { id: string }, body: Record<string, unknown>) {
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: job, error } = await service
    .from("jobs")
    .select("id,status,app_state,output_url_final,video_url")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const state = job.app_state as UGCNativeAdState | null;
  if (state?.capability !== "ugc_native_ad" || !state.task) {
    return NextResponse.json({ error: "This is not a native UGC ad job." }, { status: 400 });
  }
  if (job.status === "done" && (job.output_url_final || job.video_url)) {
    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: "done",
      videoUrl: job.output_url_final || job.video_url,
      usageUnits: state.output?.usageUnits,
    });
  }

  const task: UGCNativeAdTask = {
    adId: state.task.adId,
    providerTaskId: state.task.providerTaskId,
    status: "processing",
  };
  const provider = new BytePlusUGCNativeAdProvider();
  const result = await provider.poll(task);
  if (result.status === "processing") {
    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: "processing",
      usageUnits: result.usageUnits,
    });
  }

  if (result.status === "failed" || !result.videoUrl) {
    const nextState: UGCNativeAdState = {
      ...state,
      output: {
        status: "failed",
        errorCode: result.errorCode || "generation_failed",
        usageUnits: result.usageUnits,
      },
    };
    const { error: updateError } = await service
      .from("jobs")
      .update({
        status: "failed",
        current_stage: "failed",
        error_message: "The native UGC ad could not be completed.",
        app_state: nextState,
      })
      .eq("id", job.id);
    if (updateError) {
      return NextResponse.json({ error: "Could not save native UGC progress." }, { status: 500 });
    }
    return NextResponse.json(
      { success: false, jobId: job.id, status: "failed" },
      { status: 502 }
    );
  }

  const permanentUrl = await downloadAndUploadToR2(
    result.videoUrl,
    `videos/ugc-native-ad/${job.id}/${randomUUID()}.mp4`
  );
  const nextState: UGCNativeAdState = {
    ...state,
    output: {
      status: "ready",
      videoUrl: permanentUrl,
      usageUnits: result.usageUnits,
    },
  };
  const { error: updateError } = await service
    .from("jobs")
    .update({
      status: "done",
      current_stage: "done",
      error_message: null,
      video_url: permanentUrl,
      output_url_final: permanentUrl,
      app_state: nextState,
    })
    .eq("id", job.id);
  if (updateError) {
    return NextResponse.json({ error: "Could not save the finished native UGC ad." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    jobId: job.id,
    status: "done",
    videoUrl: permanentUrl,
    usageUnits: result.usageUnits,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === "start") return startNativeAd(auth.user, body);
  if (body.action === "poll") return pollNativeAd(auth.user, body);
  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
