import type { ReferencePayload } from "@/lib/types";

export const UGC_SHOT_PACK_VERSION = "ugc-shot-pack-v2";
export const UGC_SHOT_PACK_SIZE = 3;
export const UGC_NATIVE_AD_VERSION = "ugc-native-ad-v1";

export type UGCShotRole = "creator_hook" | "product_demo" | "lifestyle_cta";
export type UGCShotStatus = "processing" | "ready" | "failed";

export interface UGCShotSpec {
  id: string;
  role: UGCShotRole;
  prompt: string;
  durationSeconds: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  references: ReferencePayload;
  verifiedAssetIds?: string[];
  generateAudio: boolean;
}

export interface UGCShotTask {
  shotId: string;
  providerTaskId: string;
  status: "processing";
}

export interface UGCShotPollResult {
  shotId: string;
  status: UGCShotStatus;
  videoUrl?: string;
  errorCode?: string;
  usageUnits?: number;
}

export interface UGCShotProvider {
  readonly id: string;
  readonly capabilities: {
    multipleImageReferences: boolean;
    videoReferences: boolean;
    audioReferences: boolean;
  };
  start(spec: UGCShotSpec): Promise<UGCShotTask>;
  poll(task: UGCShotTask): Promise<UGCShotPollResult>;
}

export interface UGCNativeAdSpec {
  id: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  references: ReferencePayload;
  verifiedAssetIds?: string[];
  generateAudio: boolean;
}

export interface UGCNativeAdTask {
  adId: string;
  providerTaskId: string;
  status: "processing";
}

export interface UGCNativeAdPollResult {
  adId: string;
  status: UGCShotStatus;
  videoUrl?: string;
  errorCode?: string;
  usageUnits?: number;
}

export interface UGCNativeAdProvider {
  readonly id: string;
  readonly capabilities: {
    nativeMultiShot: boolean;
    multipleImageReferences: boolean;
    videoReferences: boolean;
    nativeAudio: boolean;
  };
  start(spec: UGCNativeAdSpec): Promise<UGCNativeAdTask>;
  poll(task: UGCNativeAdTask): Promise<UGCNativeAdPollResult>;
}

export function validateUGCShotPack(shots: UGCShotSpec[]): void {
  if (shots.length !== UGC_SHOT_PACK_SIZE) {
    throw new Error(`A UGC shot pack must contain exactly ${UGC_SHOT_PACK_SIZE} shots.`);
  }

  const ids = new Set(shots.map((shot) => shot.id));
  if (ids.size !== shots.length) {
    throw new Error("UGC shot ids must be unique.");
  }

  const roles = new Set(shots.map((shot) => shot.role));
  for (const required of ["creator_hook", "product_demo", "lifestyle_cta"] as const) {
    if (!roles.has(required)) throw new Error(`UGC shot pack is missing ${required}.`);
  }

  for (const shot of shots) {
    if (!shot.prompt.trim()) throw new Error(`UGC shot ${shot.id} has no prompt.`);
    if (shot.durationSeconds < 4 || shot.durationSeconds > 8) {
      throw new Error(`UGC shot ${shot.id} must last between 4 and 8 seconds.`);
    }
  }
}
