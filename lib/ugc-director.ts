import { getUGCSocialPreset, type UGCSocialPreset, type UGCSocialPlatform } from "@/lib/ugc-social-pack";

export type UGCPlatform = UGCSocialPlatform;
export type UGCAngle =
  | "testimonial"
  | "unboxing"
  | "try_on"
  | "product_demo"
  | "before_after"
  | "founder_pitch";
export type UGCCreator = "verified_face" | "saved_look" | "avatar" | "none";

export type UGCReferenceInput = {
  label?: string;
  placeholder?: string;
};

export type UGCScene = {
  title: string;
  role: "hook" | "problem" | "demo" | "style" | "benefit" | "cta";
  prompt: string;
  durationSec: number;
  assetChips: string[];
};

export type UGCPlan = {
  prompt: string;
  scenes: UGCScene[];
  aspectRatio: "9:16" | "1:1" | "16:9";
  recommendedSceneCount: number;
  social: UGCSocialPreset;
};

export type BuildUGCPlanInput = {
  product: UGCReferenceInput;
  outfit?: UGCReferenceInput | null;
  angle: UGCAngle;
  platform: UGCPlatform;
  creator: UGCCreator;
  creatorLabel?: string;
  productName?: string;
  keyBenefit?: string;
  tone?: string;
};

const ANGLE_COPY: Record<UGCAngle, { hook: string; demo: string; cta: string }> = {
  testimonial: {
    hook: "personal creator testimonial with an immediate honest reaction",
    demo: "show the product in use while explaining the everyday benefit",
    cta: "soft recommendation, like a creator sharing something worth trying",
  },
  unboxing: {
    hook: "quick unboxing moment with tactile close-ups",
    demo: "reveal packaging details, texture, and first-use impression",
    cta: "invite the viewer to check the product after seeing the reveal",
  },
  try_on: {
    hook: "creator steps into frame with a confident outfit reveal",
    demo: "show fit, movement, styling details, and product close-ups",
    cta: "suggest how the look can be worn in real life",
  },
  product_demo: {
    hook: "clear product-first hook with the item visible in the first second",
    demo: "demonstrate the main feature with believable hand interaction",
    cta: "summarize the benefit and invite the viewer to learn more",
  },
  before_after: {
    hook: "before-state problem setup, fast and relatable",
    demo: "show the product creating a visible improvement or smoother workflow",
    cta: "end on the after-state and the main reason it matters",
  },
  founder_pitch: {
    hook: "founder-style direct-to-camera pitch with conviction",
    demo: "explain the product decision, who it is for, and why it exists",
    cta: "close with a confident brand-style invitation",
  },
};

function clean(value: string | undefined, fallback: string, max = 120): string {
  const text = value?.trim();
  return text ? text.slice(0, max) : fallback;
}

function creatorCopy(creator: UGCCreator, label?: string): string {
  const name = clean(label, "", 80);
  if (creator === "verified_face") {
    return name
      ? `Use verified creator ${name} consistently across all scenes.`
      : "Use the selected verified creator consistently across all scenes.";
  }
  if (creator === "saved_look") {
    return name
      ? `Reuse saved Look ${name} as the visual identity for the creator shot.`
      : "Reuse the selected saved Look as the visual identity for the creator shot.";
  }
  if (creator === "avatar") {
    return name
      ? `Use avatar ${name} as the presenter when the workflow supports it.`
      : "Use the selected avatar as the presenter when the workflow supports it.";
  }
  return "No fixed creator identity; focus on hands, product, and natural lifestyle framing.";
}

function chip(ref: UGCReferenceInput | undefined | null, fallback: string): string {
  return clean(ref?.placeholder ?? ref?.label, fallback, 60);
}

function sentence(parts: string[]): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function buildUGCDirectorPlan(input: BuildUGCPlanInput): UGCPlan {
  const productChip = chip(input.product, "image 1");
  const outfitChip = input.outfit ? chip(input.outfit, "image 2") : null;
  const productName = clean(input.productName, "the product");
  const keyBenefit = clean(input.keyBenefit, "the main benefit");
  const tone = clean(input.tone, "natural, social, premium");
  const angle = ANGLE_COPY[input.angle];
  const social = getUGCSocialPreset(input.platform);
  const creatorDirection = creatorCopy(input.creator, input.creatorLabel);
  const assetBase = [productChip, ...(outfitChip ? [outfitChip] : [])];

  const scenes: UGCScene[] = [
    {
      title: "Hook",
      role: "hook",
      durationSec: 3,
      assetChips: assetBase,
      prompt: sentence([
        `Open with ${angle.hook}.`,
        `Keep ${productName} visible using ${productChip} as the product reference.`,
        creatorDirection,
        social.hookGuidance,
        `Tone: ${tone}.`,
      ]),
    },
    {
      title: "Problem",
      role: "problem",
      durationSec: 4,
      assetChips: [productChip],
      prompt: sentence([
        `Show the relatable problem or desire that makes ${productName} useful.`,
        `Mention ${keyBenefit} in plain creator language.`,
        "Keep the delivery specific, not salesy.",
      ]),
    },
    {
      title: "Demo",
      role: "demo",
      durationSec: 5,
      assetChips: [productChip],
      prompt: sentence([
        `${angle.demo}.`,
        `Use close-ups and natural hand interaction with ${productChip}.`,
        `Make ${keyBenefit} visually understandable.`,
      ]),
    },
  ];

  if (outfitChip) {
    scenes.push({
      title: "Style Match",
      role: "style",
      durationSec: 4,
      assetChips: [productChip, outfitChip],
      prompt: sentence([
        `Use ${outfitChip} as a styling and outfit reference, not an exact try-on guarantee.`,
        `Keep ${productName} visible and integrated into the look.`,
        "Show movement, fit impression, and texture details.",
      ]),
    });
  }

  scenes.push(
    {
      title: "Benefit",
      role: "benefit",
      durationSec: 4,
      assetChips: [productChip],
      prompt: sentence([
        `Show the strongest benefit: ${keyBenefit}.`,
        `Keep ${productName} grounded in a real-life moment.`,
        "Use concise creator-style language.",
      ]),
    },
    {
      title: "CTA",
      role: "cta",
      durationSec: 3,
      assetChips: [productChip],
      prompt: sentence([
        `${angle.cta}.`,
        social.ctaGuidance,
        "End with a clean product shot and a natural pause for captions.",
      ]),
    },
  );

  const prompt = sentence([
    `UGC creator video for ${productName}.`,
    `Product reference: ${productChip}.`,
    outfitChip ? `Outfit/style reference: ${outfitChip}.` : "",
    `Angle: ${input.angle.replace(/_/g, " ")}.`,
    `Social Pack target: ${social.label}; formats: ${social.primaryFormats.join(", ")}.`,
    `Social metadata brief: ${social.metadataBrief}.`,
    `Hashtag hints: ${social.hashtagHints.join(" ")}.`,
    `Creator: ${input.creator.replace(/_/g, " ")}${input.creatorLabel ? ` (${clean(input.creatorLabel, "", 80)})` : ""}.`,
    `Benefit: ${keyBenefit}.`,
    `Tone: ${tone}.`,
  ]);

  return {
    prompt,
    scenes,
    aspectRatio: social.aspectRatio,
    recommendedSceneCount: scenes.length,
    social,
  };
}
