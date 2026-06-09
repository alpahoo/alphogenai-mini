import type { UGCAngle, UGCCreator } from "@/lib/ugc-director";

export type UGCReadinessStatus =
  | "ready"
  | "missing_product"
  | "style_only"
  | "needs_verified_identity"
  | "best_effort";

export type UGCReadinessTone = "good" | "medium" | "risky";

export type UGCReadinessInput = {
  hasProductReference: boolean;
  hasOutfitReference?: boolean;
  angle: UGCAngle;
  creator: UGCCreator;
  hasVerifiedFace?: boolean;
  hasSavedLook?: boolean;
  hasAvatar?: boolean;
};

export type UGCReadiness = {
  status: UGCReadinessStatus;
  tone: UGCReadinessTone;
  label: string;
  detail: string;
  checks: Array<{ label: string; ok: boolean }>;
};

export function computeUGCReadiness(input: UGCReadinessInput): UGCReadiness {
  const hasProduct = Boolean(input.hasProductReference);
  const hasOutfit = Boolean(input.hasOutfitReference);
  const needsTryOnCaution = input.angle === "try_on" || hasOutfit;
  const creatorReady =
    input.creator === "none" ||
    (input.creator === "verified_face" && Boolean(input.hasVerifiedFace)) ||
    (input.creator === "saved_look" && Boolean(input.hasSavedLook)) ||
    (input.creator === "avatar" && Boolean(input.hasAvatar));

  const checks = [
    { label: "Product", ok: hasProduct },
    { label: "Style", ok: hasOutfit },
    { label: "Identity", ok: creatorReady },
  ];

  if (!hasProduct && hasOutfit) {
    return {
      status: "style_only",
      tone: "medium",
      label: "Style-only",
      detail: "Add a product image to turn this into a product-first UGC plan.",
      checks,
    };
  }

  if (!hasProduct) {
    return {
      status: "missing_product",
      tone: "risky",
      label: "Missing product",
      detail: "Upload or drop a product image before building the strongest UGC plan.",
      checks,
    };
  }

  if (!creatorReady) {
    return {
      status: "needs_verified_identity",
      tone: "medium",
      label: "Needs identity",
      detail: "The selected creator identity is not available yet; switch identity or add one.",
      checks,
    };
  }

  if (needsTryOnCaution) {
    return {
      status: "best_effort",
      tone: "medium",
      label: "Best effort",
      detail: "Outfit/style references guide the look; exact try-on is not guaranteed in V1.",
      checks,
    };
  }

  return {
    status: "ready",
    tone: "good",
    label: "Ready",
    detail: "Product reference, creator direction, and Social Pack preset are ready.",
    checks,
  };
}
