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

export function buildUGCNativeAdSpec(input: BuildUGCNativeAdInput): UGCNativeAdSpec {
  const { brief } = input;
  if (!brief.imageUrls.length) {
    throw new Error("At least one product image is required to build a native UGC ad.");
  }

  const aspectRatio = input.aspectRatio ?? "9:16";
  const language = input.language?.trim() || "French (France)";
  const productName = brief.title || "the featured product";
  const benefit = brief.description || "its main practical benefit";
  const presenterVideos = input.presenterVideo
    ? [{ ...input.presenterVideo, role: input.presenterVideo.role || "character_face" }]
    : undefined;

  return {
    id: UGC_NATIVE_AD_VERSION,
    durationSeconds: 15,
    aspectRatio,
    references: {
      images: productReferences(brief.imageUrls),
      ...(presenterVideos ? { videos: presenterVideos } : {}),
    },
    verifiedAssetIds: input.verifiedAssetIds,
    generateAudio: true,
    prompt:
      `Create one polished 15-second native UGC product advertisement for ${productName}. ` +
      `Use a coherent three-beat sequence with seamless motivated cuts, not a collage: ` +
      `[0-4s] immediate creator hook in a believable everyday setting; the creator holds the exact product ` +
      `and speaks one short natural sentence in ${language}. ` +
      `[4-10s] close product demonstration with natural hands showing real use and emphasizing ${benefit}. ` +
      `[10-15s] return to the same creator using the product in a credible lifestyle moment, ending on a ` +
      `confident reaction and a clean product hero frame. ` +
      `Preserve the exact product design, colors, proportions and logo from the references. Preserve the ` +
      `presenter's identity and appearance when a presenter reference is supplied. Photorealistic handheld ` +
      `social-ad cinematography, premium natural lighting, coherent wardrobe and location, synchronized ` +
      `native speech and realistic ambient sound. No subtitles, no generated text, no watermark, no floating ` +
      `product cutout, no poster layout, no split screen, no duplicated product.`,
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
