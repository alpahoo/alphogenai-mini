export type PodcastStudioPreset = {
  id: string;
  label: string;
  description: string;
  packId: string;
  hostPersonaId: string;
  guestPersonaId: string;
  hostPromptVersion: string;
  guestPromptVersion: string;
  shots: {
    wide: string;
    host: string;
    guest: string;
    alternate: string;
  };
};

const R2 = "https://pub-17f0392d1f8d4270ad79966ad1ea7545.r2.dev";

export const PODCAST_STUDIO_PRESETS: readonly PodcastStudioPreset[] = [
  {
    id: "maya-leo-modern",
    label: "Maya & Leo Studio",
    description: "A shared premium studio with wide shots, close-ups and reactions.",
    packId: "8155d96d-5bd7-4dcd-b094-20c9222ddc9f",
    hostPersonaId: "fa54f41b-8cb8-4f70-b022-a13131228092",
    guestPersonaId: "c93178eb-2e8f-4fbe-93cf-5540ee1429ff",
    hostPromptVersion: "studio-pack-8155d96d-5bd7-4dcd-b094-20c9222ddc9f-host-byteplus-v1",
    guestPromptVersion: "studio-pack-8155d96d-5bd7-4dcd-b094-20c9222ddc9f-guest-byteplus-v1",
    shots: {
      wide: `${R2}/podcast/studio-packs/8155d96d-5bd7-4dcd-b094-20c9222ddc9f/shot-1.jpg`,
      host: `${R2}/podcast/studio-packs/8155d96d-5bd7-4dcd-b094-20c9222ddc9f/shot-2.jpg`,
      guest: `${R2}/podcast/studio-packs/8155d96d-5bd7-4dcd-b094-20c9222ddc9f/shot-3.jpg`,
      alternate: `${R2}/podcast/studio-packs/8155d96d-5bd7-4dcd-b094-20c9222ddc9f/shot-4.jpg`,
    },
  },
] as const;

export function getPodcastStudioPreset(id: unknown) {
  return typeof id === "string"
    ? PODCAST_STUDIO_PRESETS.find((preset) => preset.id === id) ?? null
    : null;
}
