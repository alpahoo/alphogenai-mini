export const PODCAST_STUDIO_STYLES = [
  {
    id: "modern",
    label: "Modern studio",
    description: "Dark acoustic panels, warm practical lights and a premium wood desk.",
    prompt: "premium modern podcast studio, dark acoustic panels, warm practical lights, walnut desk",
  },
  {
    id: "warm",
    label: "Warm lounge",
    description: "Comfortable editorial lounge with soft daylight and natural textures.",
    prompt: "warm editorial podcast lounge, soft daylight, natural fabrics, plants and a low wood table",
  },
  {
    id: "newsroom",
    label: "Creator newsroom",
    description: "Bright contemporary set with restrained screens and broadcast lighting.",
    prompt: "contemporary creator newsroom, clean broadcast lighting, restrained screens, premium neutral palette",
  },
] as const;

export type PodcastStudioStyleId = (typeof PODCAST_STUDIO_STYLES)[number]["id"];

export function getPodcastStudioStyle(value: unknown) {
  return PODCAST_STUDIO_STYLES.find((style) => style.id === value) ?? PODCAST_STUDIO_STYLES[0];
}

export function buildPodcastStudioPreviewPrompt(styleId: unknown) {
  const style = getPodcastStudioStyle(styleId);
  return [
    "Create one photorealistic 16:9 establishing image for a premium two-person video podcast.",
    "Image 1 is the HOST identity and Image 2 is the GUEST identity.",
    "Preserve both faces, age, skin tone, hair and distinguishing features faithfully.",
    `Place both people naturally in the same ${style.prompt}.`,
    "They sit across the same desk, each with a professional broadcast microphone, believable eye-lines and relaxed conversational posture.",
    "Frame a coherent medium-wide two-shot with both upper bodies visible and enough clean space for later close-up crops.",
    "Match lighting, perspective, furniture and color grade across both people so this looks like one real photograph captured at the same moment.",
    "Realistic skin and hands, documentary photography, no split screen, no cards, no collage, no text, no logos, no watermark.",
  ].join(" ");
}
