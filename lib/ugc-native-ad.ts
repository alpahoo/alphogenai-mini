import type { ProductPageBrief } from "@/lib/native-product-ad";
import type { ReferenceItem } from "@/lib/types";
import {
  UGC_NATIVE_AD_VERSION,
  type UGCNativeAdSpec,
} from "@/lib/ugc-shot-provider";

export interface BuildUGCNativeAdInput {
  brief: ProductPageBrief;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  presenterVideo?: ReferenceItem | null;
  verifiedAssetIds?: string[];
  language?: string;
  script?: string;
  productReferenceUrls?: string[];
}

export interface BuildUGCVisualPreviewInput {
  brief: ProductPageBrief;
  aspectRatio?: "9:16" | "1:1" | "16:9";
}

function productReferences(imageUrls: string[]): ReferenceItem[] {
  return imageUrls.slice(0, 6).map((url, index) => ({
    role: "product_reference",
    url,
    filename: `product-reference-${index + 1}`,
  }));
}

function cleanCreativeText(value: string | undefined, maxLength: number): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function buildUGCNativeAdSpec(input: BuildUGCNativeAdInput): UGCNativeAdSpec {
  const { brief } = input;
  const selectedProductReferences =
    input.productReferenceUrls?.filter(Boolean).slice(0, 6) ?? brief.imageUrls.slice(0, 6);
  if (!selectedProductReferences.length) {
    throw new Error("At least one product image is required to build a native UGC ad.");
  }

  const aspectRatio = input.aspectRatio ?? "9:16";
  const language = input.language?.trim() || "French (France)";
  const productName = brief.title || "the featured product";
  const benefit = brief.description || "its main practical benefit";
  const script = cleanCreativeText(input.script, 1600);
  const actorReferenceIndex = input.verifiedAssetIds?.length ? 1 : null;
  const productReferenceStart = actorReferenceIndex ? 2 : 1;
  const productReferenceLabels = selectedProductReferences
    .map((_, index) => `image ${productReferenceStart + index}`)
    .join(", ");
  const presenterVideos = input.presenterVideo
    ? [{ ...input.presenterVideo, role: input.presenterVideo.role || "character_face" }]
    : undefined;

  return {
    id: UGC_NATIVE_AD_VERSION,
    durationSeconds: 15,
    aspectRatio,
    references: {
      images: productReferences(selectedProductReferences),
      ...(presenterVideos ? { videos: presenterVideos } : {}),
    },
    verifiedAssetIds: input.verifiedAssetIds,
    generateAudio: true,
    prompt:
      `Create one coherent 15-second creator-led UGC product advertisement for ${productName}. ` +
      `This must feel like one real influencer performance, not B-roll with a voice-over and not a collage. ` +
      (actorReferenceIndex
        ? `The creator is image ${actorReferenceIndex}; preserve this exact verified identity throughout. `
        : "") +
      `The exact product references are ${productReferenceLabels}. Preserve their design, colors, proportions, ` +
      `materials and logo. The creator must visibly wear, hold or use this exact product in every creator-facing ` +
      `shot. Show believable physical interaction: touch it, adjust it, demonstrate the fit or feature, and ` +
      `recommend it directly to camera. Never show the creator empty-handed or without the product. ` +
      `Use one continuous believable setting, wardrobe and identity with motivated camera cuts: ` +
      `[0-4s] direct-to-camera hook while already wearing or holding the product; ` +
      `[4-10s] close demonstration by the same creator with natural hands and real use, emphasizing ${benefit}; ` +
      `[10-15s] credible personal recommendation and confident call to action while still using the product. ` +
      (script
        ? `Spoken creative brief in ${language}: "${script}". Follow this wording and intent as closely as native ` +
          `speech generation allows; do not replace it with generic marketing copy. `
        : `Write one short, natural first-person recommendation in ${language}. `) +
      `Photorealistic handheld social-ad cinematography, premium natural lighting, synchronized native speech, ` +
      `natural facial performance and realistic ambient sound. Product-only detail cutaways are allowed only ` +
      `inside the demonstration beat, then return to the same creator wearing or using the product. ` +
      `No subtitles, no generated text, no watermark, no floating product cutout, no poster layout, no split ` +
      `screen, no duplicated product, no unrelated lifestyle montage.`,
  };
}

export function buildUGCVisualPreviewSpec(
  input: BuildUGCVisualPreviewInput
): UGCNativeAdSpec {
  const { brief } = input;
  if (!brief.imageUrls.length) {
    throw new Error("At least one product image is required to build a visual preview.");
  }

  const productName = brief.title || "the featured product";
  const benefit = brief.description || "its main practical benefit";

  return {
    id: `${UGC_NATIVE_AD_VERSION}-visual-preview`,
    durationSeconds: 10,
    aspectRatio: input.aspectRatio ?? "9:16",
    references: {
      images: productReferences(brief.imageUrls).slice(0, 1),
    },
    generateAudio: false,
    prompt:
      `Create one polished 10-second vertical product-focused social advertisement for ${productName}. ` +
      `Use the supplied product image as the exact visual source and preserve its design, colors, proportions ` +
      `and logo. Build a coherent three-beat sequence with motivated camera cuts: [0-3s] an immediate premium ` +
      `product hook; [3-7s] a credible close demonstration emphasizing ${benefit}; [7-10s] a dynamic lifestyle ` +
      `payoff ending on a clean hero view of the same product. Photorealistic handheld social-ad cinematography, ` +
      `natural lighting and realistic physical motion. No presenter, no speech, no subtitles, no generated text, ` +
      `no watermark, no collage, no floating product cutout, no poster layout, no split screen, no duplicated product.`,
  };
}
