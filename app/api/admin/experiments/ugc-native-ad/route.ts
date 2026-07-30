import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { readProductPageBrief } from "@/lib/native-product-ad";
import { NATIVE_PRESENTER_BASE_BUCKET } from "@/lib/video-presenter-native";
import {
  buildUGCNativeAdSpec,
  buildUGCVisualPreviewSpec,
} from "@/lib/ugc-native-ad";
import {
  BytePlusUGCNativeAdProvider,
  BytePlusUGCVisualPreviewProvider,
} from "@/lib/providers/byteplus-ugc-shot-provider";
import {
  UGC_NATIVE_AD_VERSION,
  type UGCNativeAdTask,
} from "@/lib/ugc-shot-provider";
import { downloadAndUploadToR2, uploadBufferToR2 } from "@/lib/r2";

export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PRODUCT_REFERENCE_BYTES = 12 * 1024 * 1024;
const MAX_NATIVE_PRODUCT_REFERENCES = 4;

interface UGCNativeAdState {
  capability: "ugc_native_ad";
  version: string;
  mode: "native" | "visual_preview";
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

function isUnsafeImageHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

async function normalizeProductReference(urlString: string) {
  const url = new URL(urlString);
  if (!["http:", "https:"].includes(url.protocol) || isUnsafeImageHost(url.hostname)) {
    throw new Error("unsafe_product_reference");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "image/jpeg,image/png,image/webp,image/avif,*/*;q=0.5",
      "User-Agent": "AlphoGen-Product-Reference/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`product_reference_download_${response.status}`);

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_PRODUCT_REFERENCE_BYTES) {
    throw new Error("product_reference_too_large");
  }

  const input = Buffer.from(await response.arrayBuffer());
  if (input.length === 0 || input.length > MAX_PRODUCT_REFERENCE_BYTES) {
    throw new Error("product_reference_invalid_size");
  }

  const jpeg = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 1536,
      height: 1536,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return uploadBufferToR2(
    jpeg,
    `experiments/ugc-native-ad/product-references/${randomUUID()}.jpg`,
    "image/jpeg"
  );
}

async function normalizeProductReferences(imageUrls: string[]) {
  const selected = imageUrls.slice(0, MAX_NATIVE_PRODUCT_REFERENCES);
  const results = await Promise.allSettled(selected.map(normalizeProductReference));
  const normalized = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  console.info(
    `[ugc-native-ad] normalized product references ${normalized.length}/${selected.length}`
  );
  return normalized;
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
  const mode = body.mode === "visual_preview" ? "visual_preview" : "native";

  if (!/^https?:\/\/.+\..+/.test(url) || url.length > 2000) {
    return NextResponse.json({ error: "A valid product URL is required." }, { status: 400 });
  }

  const service = createServiceClient();
  let presenterVideoUrl: string | null = null;
  if (mode === "native" && nativeBaseId) {
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

  const providerBrief =
    mode === "native"
      ? {
          ...brief,
          imageUrls: await normalizeProductReferences(brief.imageUrls),
        }
      : brief;
  if (!providerBrief.imageUrls.length) {
    return NextResponse.json(
      { error: "The product images could not be prepared for video generation." },
      { status: 422 }
    );
  }
  providerBrief.imageUrl = providerBrief.imageUrls[0] || null;

  const spec =
    mode === "visual_preview"
      ? buildUGCVisualPreviewSpec({ brief: providerBrief, aspectRatio })
      : buildUGCNativeAdSpec({
          brief: providerBrief,
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
    mode,
    url,
    product: brief,
    prompt: spec.prompt,
    nativeBaseId: mode === "native" ? nativeBaseId || null : null,
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
      current_stage:
        mode === "visual_preview"
          ? "ugc_visual_preview_generating"
          : "ugc_native_generating",
      aspect_ratio: aspectRatio,
      target_duration_seconds: spec.durationSeconds,
      app_state: initialState,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Could not reserve the native UGC ad." }, { status: 500 });
  }

  const provider =
    mode === "visual_preview"
      ? new BytePlusUGCVisualPreviewProvider()
      : new BytePlusUGCNativeAdProvider();
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
  const provider =
    state.mode === "visual_preview"
      ? new BytePlusUGCVisualPreviewProvider()
      : new BytePlusUGCNativeAdProvider();
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
