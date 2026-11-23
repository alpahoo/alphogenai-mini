import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { readProductPageBrief } from "@/lib/native-product-ad";
import {
  buildUGCNativeAdSpec,
  buildUGCVisualPreviewSpec,
  toUGCNativeStartFailure,
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
import {
  pollUGCLipSyncPolish,
  startUGCLipSyncPolish,
} from "@/lib/video-presenter-native-animation-provider";

export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PRODUCT_REFERENCE_BYTES = 12 * 1024 * 1024;
// User-selected references may include product, use and scene images. Automatic
// page extraction still contributes only one packshot because pages often mix
// product media with incidental real-person photos.
const MAX_NATIVE_PRODUCT_REFERENCES = 6;
const MAX_NATIVE_SCRIPT_LENGTH = 1600;

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
  creative: {
    script: string | null;
    productReferenceCount: number;
  };
  nativeBaseId: string | null;
  verifiedAssetIds: string[];
  task: {
    adId: string;
    providerTaskId: string;
  } | null;
  polish: {
    status: "processing" | "failed";
    taskId: string;
    rawVideoUrl: string;
    errorCode?: string;
  } | null;
  output: {
    status: "ready" | "failed";
    videoUrl?: string;
    errorCode?: string;
    usageUnits?: number;
    polishApplied?: boolean;
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

async function resolveUploadedProductReferences(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  requestedPaths: string[]
) {
  const uniquePaths = [...new Set(requestedPaths)]
    .filter((path) => path.startsWith(`${userId}/`) && !path.includes(".."))
    .slice(0, MAX_NATIVE_PRODUCT_REFERENCES);
  if (uniquePaths.length !== requestedPaths.length) {
    throw new Error("invalid_product_reference_path");
  }

  const signed = await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, error } = await service.storage
        .from("references")
        .createSignedUrl(path, 15 * 60);
      if (error || !data?.signedUrl) throw new Error("product_reference_sign_failed");
      return data.signedUrl;
    })
  );
  return normalizeProductReferences(signed);
}

async function resolveVerifiedAssetIds(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  requestedAssetIds: string[],
  useLatestFallback: boolean
) {
  if (requestedAssetIds.length > 0) {
    const { data, error } = await service
      .from("byteplus_assets")
      .select("asset_id")
      .eq("user_id", userId)
      .in("asset_id", requestedAssetIds);
    if (error) throw new Error("verified_asset_lookup_failed");

    const ownedIds = new Set((data ?? []).map((item) => item.asset_id));
    if (requestedAssetIds.some((assetId) => !ownedIds.has(assetId))) {
      throw new Error("verified_asset_not_owned");
    }
    return requestedAssetIds;
  }

  if (!useLatestFallback) return [];

  // Older deployed clients only sent nativeBaseId. Fall back to the user's
  // latest verified identity so a stale browser bundle cannot submit the raw
  // real-person performance video that BytePlus rejects.
  const { data, error } = await service
    .from("byteplus_assets")
    .select("asset_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("verified_asset_lookup_failed");
  return data?.asset_id ? [data.asset_id] : [];
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
  const script =
    typeof body.script === "string"
      ? body.script.replace(/\s+/g, " ").trim().slice(0, MAX_NATIVE_SCRIPT_LENGTH)
      : "";
  const productReferencePaths = Array.isArray(body.productReferencePaths)
    ? body.productReferencePaths
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, MAX_NATIVE_PRODUCT_REFERENCES)
    : [];
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
  let resolvedAssetIds: string[] = [];
  if (mode === "native") {
    try {
      resolvedAssetIds = await resolveVerifiedAssetIds(
        service,
        user.id,
        verifiedAssetIds,
        Boolean(nativeBaseId)
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "verified_asset_lookup_failed";
      return NextResponse.json(
        {
          error:
            message === "verified_asset_not_owned"
              ? "The selected verified creator identity is not available."
              : "The verified creator identity could not be loaded.",
        },
        { status: message === "verified_asset_not_owned" ? 404 : 500 }
      );
    }
    if (nativeBaseId && resolvedAssetIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Select a verified creator identity before using a real-person presenter.",
        },
        { status: 409 }
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

  let normalizedProductReferences: string[] = [];
  if (mode === "native") {
    try {
      normalizedProductReferences = productReferencePaths.length
        ? await resolveUploadedProductReferences(
            service,
            user.id,
            productReferencePaths
          )
        : await normalizeProductReferences(brief.imageUrls.slice(0, 1));
    } catch (error) {
      console.error("[ugc-native-ad] product reference preparation failed", error);
      return NextResponse.json(
        { error: "The selected product references could not be prepared." },
        { status: 422 }
      );
    }
  }

  const providerBrief =
    mode === "native"
      ? {
          ...brief,
          imageUrls: normalizedProductReferences,
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
          script,
          productReferenceUrls: providerBrief.imageUrls,
          verifiedAssetIds: resolvedAssetIds,
          // Seedance accepts the verified asset:// identity. Sending the raw
          // performance video as well trips its real-person privacy filter.
          presenterVideo: null,
        });
  const initialState: UGCNativeAdState = {
    capability: "ugc_native_ad",
    version: UGC_NATIVE_AD_VERSION,
    mode,
    url,
    product: brief,
    prompt: spec.prompt,
    creative: {
      script: script || null,
      productReferenceCount: providerBrief.imageUrls.length,
    },
    nativeBaseId: mode === "native" ? nativeBaseId || null : null,
    verifiedAssetIds: mode === "native" ? resolvedAssetIds : [],
    task: null,
    polish: null,
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
    const failure = toUGCNativeStartFailure(error);
    await service
      .from("jobs")
      .update({
        status: "failed",
        current_stage: "failed",
        error_message: failure.message,
      })
      .eq("id", job.id);
    return NextResponse.json(
      { error: failure.message, jobId: job.id },
      { status: failure.status }
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

  if (state.polish?.status === "processing") {
    const polishResult = await pollUGCLipSyncPolish(state.polish.taskId);
    if (polishResult.status === "processing") {
      return NextResponse.json({
        success: true,
        jobId: job.id,
        status: "processing",
        stage: "lipsync_polish",
        usageUnits: state.output?.usageUnits,
      });
    }

    const polishApplied = polishResult.status === "completed";
    const finalVideoUrl = polishApplied
      ? polishResult.outputUrl
      : state.polish.rawVideoUrl;
    const nextState: UGCNativeAdState = {
      ...state,
      polish: polishApplied
        ? null
        : {
            ...state.polish,
            status: "failed",
            errorCode: "lipsync_polish_failed",
          },
      output: {
        status: "ready",
        videoUrl: finalVideoUrl,
        usageUnits: state.output?.usageUnits,
        polishApplied,
        ...(polishApplied ? {} : { errorCode: "lipsync_polish_failed" }),
      },
    };
    const { error: updateError } = await service
      .from("jobs")
      .update({
        status: "done",
        current_stage: "done",
        error_message: null,
        video_url: finalVideoUrl,
        output_url_final: finalVideoUrl,
        app_state: nextState,
      })
      .eq("id", job.id);
    if (updateError) {
      return NextResponse.json({ error: "Could not save the polished UGC ad." }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: "done",
      videoUrl: finalVideoUrl,
      polishApplied,
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

  if (state.mode === "native") {
    try {
      // The provider video contains the approved narration. Feeding the same
      // media as audio preserves that voice while LatentSync corrects phonemes.
      const polishTaskId = await startUGCLipSyncPolish({
        videoUrl: permanentUrl,
        audioUrl: permanentUrl,
      });
      const nextState: UGCNativeAdState = {
        ...state,
        polish: {
          status: "processing",
          taskId: polishTaskId,
          rawVideoUrl: permanentUrl,
        },
        output: {
          status: "ready",
          videoUrl: permanentUrl,
          usageUnits: result.usageUnits,
          polishApplied: false,
        },
      };
      const { error: updateError } = await service
        .from("jobs")
        .update({ current_stage: "lipsync_polish", app_state: nextState })
        .eq("id", job.id);
      if (updateError) {
        return NextResponse.json({ error: "Could not save lip-sync progress." }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        jobId: job.id,
        status: "processing",
        stage: "lipsync_polish",
        usageUnits: result.usageUnits,
      });
    } catch (error) {
      console.error(`[ugc-native-ad] lip-sync polish start failed job=${job.id}`, error);
      // Polish is additive: the already-approved native result remains usable.
    }
  }

  const nextState: UGCNativeAdState = {
    ...state,
    output: {
      status: "ready",
      videoUrl: permanentUrl,
      usageUnits: result.usageUnits,
      polishApplied: false,
      ...(state.mode === "native" ? { errorCode: "lipsync_polish_unavailable" } : {}),
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

async function retryLipSyncPolish(user: { id: string }, body: Record<string, unknown>) {
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
  if (state?.capability !== "ugc_native_ad" || state.mode !== "native") {
    return NextResponse.json({ error: "This job cannot use UGC lip-sync polish." }, { status: 400 });
  }
  if (state.polish?.status === "processing") {
    return NextResponse.json(
      { success: true, jobId: job.id, status: "processing", stage: "lipsync_polish" },
      { status: 202 },
    );
  }

  const rawVideoUrl =
    state.polish?.rawVideoUrl ||
    state.output?.videoUrl ||
    job.output_url_final ||
    job.video_url;
  if (typeof rawVideoUrl !== "string" || !rawVideoUrl) {
    return NextResponse.json({ error: "This job has no reusable source video." }, { status: 409 });
  }

  try {
    const taskId = await startUGCLipSyncPolish({
      videoUrl: rawVideoUrl,
      audioUrl: rawVideoUrl,
    });
    const nextState: UGCNativeAdState = {
      ...state,
      polish: { status: "processing", taskId, rawVideoUrl },
      output: {
        status: "ready",
        videoUrl: rawVideoUrl,
        usageUnits: state.output?.usageUnits,
        polishApplied: false,
      },
    };
    const { error: updateError } = await service
      .from("jobs")
      .update({
        status: "in_progress",
        current_stage: "lipsync_polish",
        error_message: null,
        app_state: nextState,
      })
      .eq("id", job.id);
    if (updateError) {
      return NextResponse.json({ error: "Could not save lip-sync retry progress." }, { status: 500 });
    }
    return NextResponse.json(
      { success: true, jobId: job.id, status: "processing", stage: "lipsync_polish" },
      { status: 202 },
    );
  } catch (retryError) {
    console.error(`[ugc-native-ad] lip-sync retry failed job=${job.id}`, retryError);
    return NextResponse.json(
      {
        error:
          retryError instanceof Error
            ? retryError.message
            : "Lip-sync polish could not be started.",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === "start") return startNativeAd(auth.user, body);
  if (body.action === "poll") return pollNativeAd(auth.user, body);
  if (body.action === "retry_polish") return retryLipSyncPolish(auth.user, body);
  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
