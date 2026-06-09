import { cleanModelName } from "@/lib/engine-intentions";
import { AI_DIRECTOR_AUTO_ENGINE } from "@/lib/director-engine";
import { getEngineDisplayName, type EngineKey } from "@/lib/types";

export type UGCCapabilityLevel = "none" | "best_effort" | "supported" | "validated";

export type UGCModelCapabilities = {
  engine: EngineKey;
  publicModelName: string;
  productGrounding: UGCCapabilityLevel;
  logoText: UGCCapabilityLevel;
  outfitStyle: UGCCapabilityLevel;
  exactTryOn: UGCCapabilityLevel;
  verifiedIdentity: UGCCapabilityLevel;
  maxReliableDurationSec: number;
  recommendedUses: string[];
  cautions: string[];
};

const DEFAULT_CAPABILITIES: Omit<UGCModelCapabilities, "engine" | "publicModelName"> = {
  productGrounding: "best_effort",
  logoText: "none",
  outfitStyle: "best_effort",
  exactTryOn: "none",
  verifiedIdentity: "none",
  maxReliableDurationSec: 10,
  recommendedUses: ["General UGC direction"],
  cautions: ["Product and outfit references remain best-effort."],
};

const OVERRIDES: Partial<Record<EngineKey, Partial<Omit<UGCModelCapabilities, "engine" | "publicModelName">>>> = {
  seedance2_byteplus: {
    productGrounding: "supported",
    logoText: "best_effort",
    outfitStyle: "best_effort",
    verifiedIdentity: "validated",
    maxReliableDurationSec: 15,
    recommendedUses: ["Verified creator UGC", "Product demos", "Social product scenes"],
    cautions: ["Outfit references guide styling; exact try-on is not available."],
  },
  seedance2_fast_byteplus: {
    productGrounding: "supported",
    logoText: "best_effort",
    outfitStyle: "best_effort",
    verifiedIdentity: "validated",
    maxReliableDurationSec: 15,
    recommendedUses: ["Fast verified creator UGC", "Short product demos", "TikTok/Reels drafts"],
    cautions: ["Use shorter scenes for consistency; exact try-on is not available."],
  },
  seedance2_atlas: {
    productGrounding: "supported",
    logoText: "best_effort",
    outfitStyle: "best_effort",
    maxReliableDurationSec: 15,
    recommendedUses: ["Product demos", "Image-reference UGC"],
    cautions: ["Raw human identity is not the same as verified identity."],
  },
  seedance2_fast_atlas: {
    productGrounding: "supported",
    logoText: "best_effort",
    outfitStyle: "best_effort",
    maxReliableDurationSec: 15,
    recommendedUses: ["Fast product demos", "Short social variants"],
    cautions: ["Use shorter scenes for consistency; exact try-on is not available."],
  },
  evolink: {
    productGrounding: "supported",
    logoText: "best_effort",
    outfitStyle: "best_effort",
    maxReliableDurationSec: 15,
    recommendedUses: ["Product demos", "Reference-led UGC"],
    cautions: ["Product references are model guidance, not pixel-accurate grounding."],
  },
  evolink_fast: {
    productGrounding: "supported",
    logoText: "best_effort",
    outfitStyle: "best_effort",
    maxReliableDurationSec: 15,
    recommendedUses: ["Fast product demos", "Social draft variants"],
    cautions: ["Prefer concise scenes; exact try-on is not available."],
  },
  kling_o3: {
    productGrounding: "supported",
    logoText: "best_effort",
    outfitStyle: "best_effort",
    maxReliableDurationSec: 15,
    recommendedUses: ["Product shots", "Polished image-reference scenes"],
    cautions: ["Logo/text preservation is not guaranteed."],
  },
  wan_26_bailian: {
    productGrounding: "supported",
    logoText: "best_effort",
    outfitStyle: "best_effort",
    maxReliableDurationSec: 15,
    recommendedUses: ["Product shots", "Reference-led clips"],
    cautions: ["Use as product/style guidance, not exact try-on."],
  },
  heygen_avatar_iv: {
    productGrounding: "none",
    logoText: "none",
    outfitStyle: "none",
    verifiedIdentity: "supported",
    maxReliableDurationSec: 60,
    recommendedUses: ["Talking presenter", "Scripted avatar delivery"],
    cautions: ["Not a product grounding or outfit try-on model."],
  },
  heygen_avatar_shots: {
    productGrounding: "best_effort",
    logoText: "none",
    outfitStyle: "best_effort",
    verifiedIdentity: "supported",
    maxReliableDurationSec: 15,
    recommendedUses: ["Cinematic avatar shots", "Saved Look creation"],
    cautions: ["Use product references as scene direction, not exact product grounding."],
  },
  sora_2: {
    productGrounding: "best_effort",
    logoText: "none",
    outfitStyle: "best_effort",
    maxReliableDurationSec: 12,
    recommendedUses: ["High-level cinematic UGC direction"],
    cautions: ["No reference support in the current flow."],
  },
  wan_i2v: {
    productGrounding: "best_effort",
    logoText: "none",
    outfitStyle: "best_effort",
    maxReliableDurationSec: 5,
    recommendedUses: ["Simple image-to-video motion"],
    cautions: ["Use for simple motion, not detailed product grounding."],
  },
};

export function resolveUGCCapabilityEngine(engine: EngineKey | "auto"): EngineKey {
  return engine === "auto" ? AI_DIRECTOR_AUTO_ENGINE : engine;
}

export function getUGCModelCapabilities(engine: EngineKey | "auto"): UGCModelCapabilities {
  const resolved = resolveUGCCapabilityEngine(engine);
  const override = OVERRIDES[resolved] ?? {};

  return {
    ...DEFAULT_CAPABILITIES,
    ...override,
    engine: resolved,
    publicModelName:
      engine === "auto"
        ? `Auto (${cleanModelName(getEngineDisplayName(resolved))})`
        : cleanModelName(getEngineDisplayName(resolved)),
  };
}

export function supportsExactTryOn(engine: EngineKey | "auto"): boolean {
  return getUGCModelCapabilities(engine).exactTryOn === "validated";
}

export function isStrongProductGrounding(engine: EngineKey | "auto"): boolean {
  const level = getUGCModelCapabilities(engine).productGrounding;
  return level === "supported" || level === "validated";
}
