import {
  createBytePlusTask,
  getBytePlusTask,
  type CreateBytePlusParams,
} from "@/lib/byteplus-client";
import type {
  UGCNativeAdPollResult,
  UGCNativeAdProvider,
  UGCNativeAdSpec,
  UGCNativeAdTask,
  UGCShotPollResult,
  UGCShotProvider,
  UGCShotSpec,
  UGCShotTask,
} from "@/lib/ugc-shot-provider";

export const DEFAULT_UGC_BYTEPLUS_ENGINE = "seedance2_fast_byteplus";
export const DEFAULT_UGC_NATIVE_BYTEPLUS_ENGINE = "seedance2_byteplus";

export function buildBytePlusUGCShotRequest(
  spec: UGCShotSpec,
  engineKey = DEFAULT_UGC_BYTEPLUS_ENGINE
): CreateBytePlusParams {
  return {
    engineKey,
    prompt: spec.prompt,
    duration: spec.durationSeconds,
    aspectRatio: spec.aspectRatio,
    references: spec.references,
    assetIds: spec.verifiedAssetIds,
    generateAudio: spec.generateAudio,
  };
}

export class BytePlusUGCShotProvider implements UGCShotProvider {
  readonly id = "seedance";
  readonly capabilities = {
    multipleImageReferences: true,
    videoReferences: true,
    audioReferences: true,
  };

  constructor(private readonly engineKey = DEFAULT_UGC_BYTEPLUS_ENGINE) {}

  async start(spec: UGCShotSpec): Promise<UGCShotTask> {
    const providerTaskId = await createBytePlusTask(
      buildBytePlusUGCShotRequest(spec, this.engineKey)
    );
    return { shotId: spec.id, providerTaskId, status: "processing" };
  }

  async poll(task: UGCShotTask): Promise<UGCShotPollResult> {
    const result = await getBytePlusTask(task.providerTaskId);
    if (result.status === "completed") {
      return {
        shotId: task.shotId,
        status: "ready",
        videoUrl: result.videoUrl,
        usageUnits: result.tokens,
      };
    }
    if (result.status === "failed") {
      return {
        shotId: task.shotId,
        status: "failed",
        errorCode: result.error || "generation_failed",
        usageUnits: result.tokens,
      };
    }
    return { shotId: task.shotId, status: "processing", usageUnits: result.tokens };
  }
}

export function buildBytePlusUGCNativeAdRequest(
  spec: UGCNativeAdSpec,
  engineKey = DEFAULT_UGC_NATIVE_BYTEPLUS_ENGINE
): CreateBytePlusParams {
  return {
    engineKey,
    prompt: spec.prompt,
    duration: spec.durationSeconds,
    aspectRatio: spec.aspectRatio,
    references: spec.references,
    assetIds: spec.verifiedAssetIds,
    generateAudio: spec.generateAudio,
  };
}

export class BytePlusUGCNativeAdProvider implements UGCNativeAdProvider {
  readonly id = "seedance";
  readonly capabilities = {
    nativeMultiShot: true,
    multipleImageReferences: true,
    videoReferences: true,
    nativeAudio: true,
  };

  constructor(private readonly engineKey = DEFAULT_UGC_NATIVE_BYTEPLUS_ENGINE) {}

  async start(spec: UGCNativeAdSpec): Promise<UGCNativeAdTask> {
    const providerTaskId = await createBytePlusTask(
      buildBytePlusUGCNativeAdRequest(spec, this.engineKey)
    );
    return { adId: spec.id, providerTaskId, status: "processing" };
  }

  async poll(task: UGCNativeAdTask): Promise<UGCNativeAdPollResult> {
    const result = await getBytePlusTask(task.providerTaskId);
    if (result.status === "completed") {
      return {
        adId: task.adId,
        status: "ready",
        videoUrl: result.videoUrl,
        usageUnits: result.tokens,
      };
    }
    if (result.status === "failed") {
      return {
        adId: task.adId,
        status: "failed",
        errorCode: result.error || "generation_failed",
        usageUnits: result.tokens,
      };
    }
    return { adId: task.adId, status: "processing", usageUnits: result.tokens };
  }
}
