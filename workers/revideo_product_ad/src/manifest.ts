export interface UGCEditShot {
  videoUrl: string;
  durationSeconds: number;
  eyebrow?: string;
  headline?: string;
  cta?: string;
}

export interface UGCEditManifest {
  shots: [UGCEditShot, UGCEditShot, UGCEditShot];
  voiceoverUrl?: string;
  brand?: string;
  accentColor?: string;
}

export const DEFAULT_MANIFEST: UGCEditManifest = {
  shots: [
    {
      videoUrl: "https://revideo-example-assets.s3.amazonaws.com/stars.mp4",
      durationSeconds: 5,
      eyebrow: "PRODUCT DISCOVERY",
      headline: "A better way to move.",
    },
    {
      videoUrl: "https://revideo-example-assets.s3.amazonaws.com/stars.mp4",
      durationSeconds: 5,
      eyebrow: "DESIGNED FOR REAL LIFE",
      headline: "See the detail. Feel the difference.",
    },
    {
      videoUrl: "https://revideo-example-assets.s3.amazonaws.com/stars.mp4",
      durationSeconds: 5,
      eyebrow: "AVAILABLE NOW",
      headline: "Ready when you are.",
      cta: "Discover",
    },
  ],
  brand: "AlphoGen",
  accentColor: "#36d399",
};
