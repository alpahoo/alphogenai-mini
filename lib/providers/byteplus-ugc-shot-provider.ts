import {
  createBytePlusTask,
  getBytePlusTask,
  type CreateBytePlusParams,
} from "@/lib/byteplus-client";
import type {
  UGCShotPollResult,
  UGCShotProvider,
  UGCShotSpec,
  UGCShotTask,
} from "@/lib/ugc-shot-provider";

export const DEFAULT_UGC_BYTEPLUS_ENGINE = "seedance2_fast_byteplus";

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
