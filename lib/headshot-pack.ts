export const HEADSHOT_ROLES = ["studio", "executive", "natural", "creative"] as const;
export type HeadshotRole = (typeof HEADSHOT_ROLES)[number];

export interface HeadshotPackInput {
  name?: string;
  sourceImages: string[];
  consent: true;
}

const LOOKS: Record<HeadshotRole, string> = {
  studio: "clean light-gray studio background, soft frontal key light, dark neutral jacket, polished corporate portrait",
  executive: "refined modern office background with shallow depth of field, confident executive wardrobe, premium editorial lighting",
  natural: "warm window daylight, subtle neutral indoor background, approachable smart-casual wardrobe, natural editorial portrait",
  creative: "minimal contemporary workspace, tasteful color accent, modern creative-professional wardrobe, crisp magazine lighting",
};

export function isHeadshotRole(value: unknown): value is HeadshotRole {
  return typeof value === "string" && HEADSHOT_ROLES.includes(value as HeadshotRole);
}

export function validateHeadshotInput(body: unknown): { value?: HeadshotPackInput; error?: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request." };
  const raw = body as Record<string, unknown>;
  const nameValue = typeof raw.name === "string" ? raw.name.trim() : "";
  const sourceImages = Array.isArray(raw.source_images)
    ? raw.source_images.filter((value): value is string => typeof value === "string" && /^https?:\/\//.test(value))
    : [];
  if (sourceImages.length < 1 || sourceImages.length > 6) return { error: "Add between 1 and 6 photos of the same person." };
  if (nameValue.length > 100) return { error: "Name is too long." };
  if (raw.consent !== true) return { error: "Confirm that you have permission to use this person's likeness." };
  return { value: { name: nameValue || undefined, sourceImages, consent: true } };
}

export function buildHeadshotPrompts(input: HeadshotPackInput): Record<HeadshotRole, string> {
  const subject = input.name ? `The subject is ${input.name}.` : "";
  const identity = `Use every supplied photo only as identity reference for the same person. ${subject} Preserve the exact recognizable identity, facial geometry, skin tone, age, eye shape and color, nose, lips, hairline, hairstyle and distinctive features. Do not replace, blend, beautify, de-age, feminize, masculinize, or reinterpret the person. Keep realistic skin texture and natural asymmetry.`;
  return Object.fromEntries(HEADSHOT_ROLES.map((role) => [role,
    `${identity} Create one photorealistic professional head-and-shoulders headshot: ${LOOKS[role]}. Subject faces the camera with a natural relaxed expression. 85mm portrait photography, realistic proportions, sharp eyes, no text, no logo, no watermark, no extra people, square composition.`
  ])) as Record<HeadshotRole, string>;
}

export function deriveHeadshotPackStatus(statuses: string[]) {
  const ready = statuses.filter((status) => status === "ready").length;
  const failed = statuses.filter((status) => status === "failed").length;
  if (ready === HEADSHOT_ROLES.length) return "ready";
  if (statuses.some((status) => status === "processing" || status === "pending")) return "processing";
  if (ready > 0 && failed > 0) return "partial";
  if (failed === HEADSHOT_ROLES.length) return "failed";
  return "draft";
}
