import type { ProductPageBrief } from "@/lib/native-product-ad";
import type { ReferenceItem } from "@/lib/types";
import {
  UGC_SHOT_PACK_VERSION,
  type UGCShotSpec,
  validateUGCShotPack,
} from "@/lib/ugc-shot-provider";

export interface BuildUGCShotPackInput {
  brief: ProductPageBrief;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  presenterVideo?: ReferenceItem | null;
  verifiedAssetIds?: string[];
  language?: string;
}

const QUALITY_GUARDRAILS =
  "Photorealistic native UGC video, one coherent continuous shot, natural camera motion, " +
  "premium commercial lighting. Preserve the exact product design, colors, proportions and logo. " +
  "No poster layout, no collage, no floating product cutout, no duplicated object, no generated text, " +
  "no captions, no watermark.";

function productReferences(imageUrls: string[]): ReferenceItem[] {
  return imageUrls.slice(0, 4).map((url, index) => ({
    role: "product_reference",
    url,
    filename: `product-reference-${index + 1}`,
  }));
}

function optionalPresenter(reference?: ReferenceItem | null): ReferenceItem[] {
  return reference ? [{ ...reference, role: reference.role || "character_face" }] : [];
}

export function buildUGCShotPack(input: BuildUGCShotPackInput): UGCShotSpec[] {
  const { brief } = input;
  if (!brief.imageUrls.length) {
    throw new Error("At least one product image is required to build a UGC shot pack.");
  }

  const aspectRatio = input.aspectRatio ?? "9:16";
  const language = input.language ?? "French (France)";
  const productRefs = productReferences(brief.imageUrls);
  const presenterRefs = optionalPresenter(input.presenterVideo);
  const productName = brief.title || "the featured product";
  const benefit = brief.description || "its main practical benefit";

  const shots: UGCShotSpec[] = [
    {
      id: `${UGC_SHOT_PACK_VERSION}-01-hook`,
      role: "creator_hook",
      durationSeconds: 5,
      aspectRatio,
      references: { images: productRefs, videos: presenterRefs },
      verifiedAssetIds: input.verifiedAssetIds,
      generateAudio: false,
      prompt:
        `${QUALITY_GUARDRAILS} Creator hook for ${productName}. ` +
        `A credible creator in a modern everyday setting notices the product, picks it up naturally, ` +
        `and reacts with genuine curiosity. Medium close-up, immediate movement in the first second. ` +
        `The creator will speak in ${language} later; keep the mouth neutral because audio is added separately.`,
    },
    {
      id: `${UGC_SHOT_PACK_VERSION}-02-demo`,
      role: "product_demo",
      durationSeconds: 5,
      aspectRatio,
      references: { images: productRefs },
      generateAudio: false,
      prompt:
        `${QUALITY_GUARDRAILS} Product demonstration for ${productName}. ` +
        `Close-up sequence in one continuous shot: natural hands remove the product from its case, ` +
        `show the important detail, then demonstrate real use. Emphasize ${benefit}. ` +
        `Authentic social-ad cinematography, shallow depth of field, no presenter face required.`,
    },
    {
      id: `${UGC_SHOT_PACK_VERSION}-03-cta`,
      role: "lifestyle_cta",
      durationSeconds: 5,
      aspectRatio,
      references: { images: productRefs, videos: presenterRefs },
      verifiedAssetIds: input.verifiedAssetIds,
      generateAudio: false,
      prompt:
        `${QUALITY_GUARDRAILS} Lifestyle payoff for ${productName}. ` +
        `The same creator uses the product confidently in a believable active setting, then gives a subtle ` +
        `satisfied reaction to camera. Premium but authentic UGC, decisive final product hero moment, ` +
        `clean composition with safe lower-third space for an AlphoGen call to action added in post.`,
    },
  ];

  validateUGCShotPack(shots);
  return shots;
}
