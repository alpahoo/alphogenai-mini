export type UGCSocialPlatform = "tiktok_reels" | "square_feed" | "landscape_ad";

export type UGCSocialPreset = {
  platform: UGCSocialPlatform;
  label: string;
  aspectRatio: "9:16" | "1:1" | "16:9";
  primaryFormats: string[];
  captionMode: "auto";
  metadataBrief: string;
  hookGuidance: string;
  ctaGuidance: string;
  hashtagHints: string[];
};

const PRESETS: Record<UGCSocialPlatform, UGCSocialPreset> = {
  tiktok_reels: {
    platform: "tiktok_reels",
    label: "TikTok / Reels launch",
    aspectRatio: "9:16",
    primaryFormats: ["TikTok", "Instagram Reels"],
    captionMode: "auto",
    metadataBrief: "Short vertical UGC with a first-second hook, casual caption, and creator-native CTA.",
    hookGuidance: "Put the product and the promise in the first second; avoid slow intros.",
    ctaGuidance: "Close with a soft creator CTA that works as a TikTok/Reels caption line.",
    hashtagHints: ["#ugc", "#tiktokmademebuyit", "#reels", "#productdemo"],
  },
  square_feed: {
    platform: "square_feed",
    label: "Instagram feed proof",
    aspectRatio: "1:1",
    primaryFormats: ["Instagram Feed", "Reels crop-safe"],
    captionMode: "auto",
    metadataBrief: "Square UGC built for product proof, saveable captions, and a clean feed preview.",
    hookGuidance: "Frame the product centered and readable so it survives square feed cropping.",
    ctaGuidance: "End with a benefit recap that reads naturally in an Instagram caption.",
    hashtagHints: ["#ugc", "#instagram", "#productreview", "#styleinspo"],
  },
  landscape_ad: {
    platform: "landscape_ad",
    label: "Landscape ad cut",
    aspectRatio: "16:9",
    primaryFormats: ["YouTube", "Website", "Paid ad"],
    captionMode: "auto",
    metadataBrief: "Landscape product ad with clearer context, SEO-friendly description, and export-ready framing.",
    hookGuidance: "Open wider with product context, then move into a clear demo beat.",
    ctaGuidance: "Close with a brand-safe CTA suitable for YouTube description or paid ad copy.",
    hashtagHints: ["#productvideo", "#brandstory", "#aivideo", "#productdemo"],
  },
};

export function getUGCSocialPreset(platform: UGCSocialPlatform): UGCSocialPreset {
  return PRESETS[platform] ?? PRESETS.tiktok_reels;
}
