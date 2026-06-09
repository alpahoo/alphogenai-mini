import { getUGCModelCapabilities, type UGCModelCapabilities } from "@/lib/ugc-capabilities";
import { buildUGCDirectorPlan, type BuildUGCPlanInput, type UGCPlan } from "@/lib/ugc-director";
import { computeUGCReadiness, type UGCReadiness, type UGCReadinessInput } from "@/lib/ugc-readiness";
import type { EngineKey } from "@/lib/types";

export type UGCQACaseId =
  | "product_grounded_demo"
  | "outfit_style_direction"
  | "style_only_missing_product"
  | "verified_identity_missing"
  | "avatar_presenter_product";

export type UGCQACase = {
  id: UGCQACaseId;
  title: string;
  engine: EngineKey | "auto";
  expectedReadiness: UGCReadiness["status"];
  readiness: UGCReadinessInput;
  planInput?: BuildUGCPlanInput;
  manualChecks: string[];
};

export type UGCQAFixture = {
  id: UGCQACaseId;
  title: string;
  engine: EngineKey | "auto";
  capabilities: UGCModelCapabilities;
  readiness: UGCReadiness;
  plan: UGCPlan | null;
  manualChecks: string[];
};

export const UGC_QA_CASES: UGCQACase[] = [
  {
    id: "product_grounded_demo",
    title: "Product-grounded short demo",
    engine: "seedance2_fast_byteplus",
    expectedReadiness: "product_grounded",
    readiness: {
      hasProductReference: true,
      angle: "product_demo",
      creator: "none",
      selectedEngine: "seedance2_fast_byteplus",
    },
    planInput: {
      product: { label: "matte black smart bottle", placeholder: "product_reference" },
      angle: "product_demo",
      platform: "tiktok_reels",
      creator: "none",
      productName: "the smart bottle",
      keyBenefit: "keeps drinks cold all day",
      tone: "natural, useful, premium",
    },
    manualChecks: [
      "Product appears in the hook.",
      "Demo scene keeps the same product category.",
      "CTA ends on a clean product shot.",
    ],
  },
  {
    id: "outfit_style_direction",
    title: "Outfit/style direction without exact try-on",
    engine: "kling_o3",
    expectedReadiness: "exact_tryon_unavailable",
    readiness: {
      hasProductReference: true,
      hasOutfitReference: true,
      angle: "try_on",
      creator: "none",
      selectedEngine: "kling_o3",
    },
    planInput: {
      product: { label: "white sneakers", placeholder: "product_reference" },
      outfit: { label: "streetwear jacket and denim", placeholder: "outfit_reference" },
      angle: "try_on",
      platform: "tiktok_reels",
      creator: "none",
      productName: "the sneakers",
      keyBenefit: "easy styling with everyday outfits",
      tone: "confident, social, polished",
    },
    manualChecks: [
      "Outfit is treated as style direction, not a guaranteed garment swap.",
      "Product remains visible during the style scene.",
      "No UI copy promises exact try-on.",
    ],
  },
  {
    id: "style_only_missing_product",
    title: "Style-only negative case",
    engine: "auto",
    expectedReadiness: "style_only",
    readiness: {
      hasProductReference: false,
      hasOutfitReference: true,
      angle: "try_on",
      creator: "none",
      selectedEngine: "auto",
    },
    manualChecks: [
      "UI asks for a product image before calling this product-first UGC.",
      "No generation payload is proposed for product UGC without a product reference.",
    ],
  },
  {
    id: "verified_identity_missing",
    title: "Verified creator identity missing",
    engine: "seedance2_byteplus",
    expectedReadiness: "needs_verified_identity",
    readiness: {
      hasProductReference: true,
      angle: "testimonial",
      creator: "verified_face",
      hasVerifiedFace: false,
      selectedEngine: "seedance2_byteplus",
    },
    planInput: {
      product: { label: "travel coffee kit", placeholder: "product_reference" },
      angle: "testimonial",
      platform: "landscape_ad",
      creator: "verified_face",
      productName: "the travel coffee kit",
      keyBenefit: "better coffee anywhere",
      tone: "personal, warm, practical",
    },
    manualChecks: [
      "UI asks for a verified creator before presenting the plan as ready.",
      "Plan copy stays provider-neutral.",
    ],
  },
  {
    id: "avatar_presenter_product",
    title: "Avatar presenter product script",
    engine: "heygen_avatar_iv",
    expectedReadiness: "ready",
    readiness: {
      hasProductReference: true,
      angle: "founder_pitch",
      creator: "avatar",
      hasAvatar: true,
      selectedEngine: "heygen_avatar_iv",
    },
    planInput: {
      product: { label: "minimal desk lamp", placeholder: "product_reference" },
      angle: "founder_pitch",
      platform: "square_feed",
      creator: "avatar",
      creatorLabel: "studio presenter",
      productName: "the desk lamp",
      keyBenefit: "warmer focus lighting",
      tone: "calm, credible, premium",
    },
    manualChecks: [
      "Avatar is treated as presenter identity, not product grounding.",
      "Product grounding check remains false for presenter-only models.",
    ],
  },
];

export function buildUGCQAFixture(testCase: UGCQACase): UGCQAFixture {
  const capabilities = getUGCModelCapabilities(testCase.engine);
  const readiness = computeUGCReadiness(testCase.readiness);

  return {
    id: testCase.id,
    title: testCase.title,
    engine: testCase.engine,
    capabilities,
    readiness,
    plan: testCase.planInput ? buildUGCDirectorPlan(testCase.planInput) : null,
    manualChecks: testCase.manualChecks,
  };
}

export function buildAllUGCQAFixtures(cases: UGCQACase[] = UGC_QA_CASES): UGCQAFixture[] {
  return cases.map(buildUGCQAFixture);
}
