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
  "premium commercial lighting. No poster layout, no collage, no floating cutout, no generated text, " +
  "no captions, no watermark.";

const CREATOR_ONLY_GUARDRAILS =
  "Do not show, invent, hold, wear or interact with any product, package, logo or accessory. " +
  "Keep both hands empty and below chest level. Product media is added separately in post.";

const PRODUCT_ONLY_GUARDRAILS =
  "The supplied first frame is the immutable product source of truth. Preserve the exact product " +
  "geometry, colors, proportions, materials, case, accessories and logo. Do not add hands, people, " +
  "extra products, alternate colors, labels or packaging. Animate only the camera and existing light.";

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
      references: { videos: presenterRefs },
      verifiedAssetIds: input.verifiedAssetIds,
      generateAudio: false,
      prompt:
        `${QUALITY_GUARDRAILS} Creator hook for ${productName}. ` +
        `${CREATOR_ONLY_GUARDRAILS} A credible creator in a modern everyday setting looks into camera ` +
        `with an immediate, genuine discovery reaction. Medium shot, restrained natural movement, stable ` +
        `identity and framing. The creator will speak in ${language} later; keep the mouth relaxed and neutral.`,
    },
    {
      id: `${UGC_SHOT_PACK_VERSION}-02-demo`,
      role: "product_demo",
      durationSeconds: 5,
      aspectRatio,
      references: { images: productRefs.slice(0, 1) },
      generateAudio: false,
      prompt:
        `${QUALITY_GUARDRAILS} Product demonstration for ${productName}. ` +
        `${PRODUCT_ONLY_GUARDRAILS} Begin from the supplied image and create a restrained premium hero shot: ` +
        `a slow push-in with subtle parallax and realistic reflections only. Emphasize ${benefit}. ` +
        `The product must remain visually identical from first frame to last frame.`,
    },
    {
      id: `${UGC_SHOT_PACK_VERSION}-03-cta`,
      role: "lifestyle_cta",
      durationSeconds: 5,
      aspectRatio,
      references: { videos: presenterRefs },
      verifiedAssetIds: input.verifiedAssetIds,
      generateAudio: false,
      prompt:
        `${QUALITY_GUARDRAILS} Lifestyle payoff for ${productName}. ` +
        `${CREATOR_ONLY_GUARDRAILS} The same creator moves confidently through a believable active setting, ` +
        `then gives a subtle satisfied reaction to camera. Keep the creator in the upper two-thirds and leave ` +
        `clean lower-third space for an AlphoGen call to action added in post.`,
    },
  ];

  validateUGCShotPack(shots);
  return shots;
}
