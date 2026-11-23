export const COMMERCE_ROLES = ["hero", "lifestyle", "feature", "detail"] as const;
export type CommerceImageRole = (typeof COMMERCE_ROLES)[number];

export const COMMERCE_PRESETS = [
  "minimal_studio",
  "premium_dark",
  "natural_lifestyle",
  "modern_office",
] as const;
export type CommercePreset = (typeof COMMERCE_PRESETS)[number];

export interface CommercePackInput {
  productName: string;
  category: string;
  targetBuyer?: string;
  sourceUrl?: string;
  sourceImages: string[];
  verifiedFeatures: string[];
  preset: CommercePreset;
}

const PRESET_COPY: Record<CommercePreset, string> = {
  minimal_studio: "clean premium studio lighting, restrained neutral palette",
  premium_dark: "dark luxury studio, controlled reflections, dramatic rim lighting",
  natural_lifestyle: "warm natural daylight, believable everyday environment",
  modern_office: "bright modern office, refined desk setting, professional daylight",
};

export function isCommerceRole(value: unknown): value is CommerceImageRole {
  return typeof value === "string" && COMMERCE_ROLES.includes(value as CommerceImageRole);
}

export function isCommercePreset(value: unknown): value is CommercePreset {
  return typeof value === "string" && COMMERCE_PRESETS.includes(value as CommercePreset);
}

export function buildCommercePrompts(input: CommercePackInput): Record<CommerceImageRole, string> {
  const identity = `Use the supplied reference images as the exact source of truth for ${input.productName}. Preserve product silhouette, proportions, colors, visible branding, controls, materials, and included accessories. Do not invent labels, ports, features, accessories, certifications, or package contents.`;
  const style = PRESET_COPY[input.preset];
  const buyer = input.targetBuyer?.trim() || "the intended customer";

  return {
    hero: `${identity} Create a marketplace main image: product centered and fully visible on pure white #FFFFFF, even soft studio light, sharp focus, no text, no border, no badge, no decorative props, square composition.`,
    lifestyle: `${identity} Create a plausible lifestyle photograph for ${buyer} in the ${input.category} category. ${style}. The product must remain clearly visible and physically plausible in use. No text. Square composition.`,
    feature: `${identity} Create a clean product beauty image with generous negative space below and to the right for deterministic feature callouts added later by AlphoGenAI. ${style}. No generated words, letters, numbers, arrows, icons, badges, or claims. Square composition.`,
    detail: `${identity} Create an ultra-detailed commercial close-up emphasizing authentic materials, finish, texture, and craftsmanship visible in the references. ${style}. Do not reveal or invent unseen geometry. No text. Square composition.`,
  };
}

export function validateCommerceInput(body: unknown): { value?: CommercePackInput; error?: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request." };
  const raw = body as Record<string, unknown>;
  const productName = typeof raw.product_name === "string" ? raw.product_name.trim() : "";
  const category = typeof raw.category === "string" ? raw.category.trim() : "";
  const targetBuyerValue = typeof raw.target_buyer === "string" ? raw.target_buyer.trim() : "";
  const sourceUrlValue = typeof raw.source_url === "string" ? raw.source_url.trim() : "";
  const targetBuyer = targetBuyerValue || undefined;
  const sourceUrl = sourceUrlValue || undefined;
  const sourceImages = Array.isArray(raw.source_images)
    ? raw.source_images.filter((v): v is string => typeof v === "string" && /^https?:\/\//.test(v))
    : [];
  const verifiedFeatures = Array.isArray(raw.verified_features)
    ? raw.verified_features.map(String).map((v) => v.trim()).filter(Boolean).slice(0, 5)
    : [];
  const preset = isCommercePreset(raw.preset) ? raw.preset : "minimal_studio";

  if (!productName || productName.length > 200) return { error: "Product name is required (200 characters max)." };
  if (!category || category.length > 120) return { error: "Category is required (120 characters max)." };
  if (targetBuyer && targetBuyer.length > 300) return { error: "Target buyer is too long." };
  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) return { error: "Source URL must be a valid web address." };
  if (sourceImages.length < 1 || sourceImages.length > 14) return { error: "Add between 1 and 14 product images." };
  if (verifiedFeatures.length < 1) return { error: "Confirm at least one product feature." };

  return { value: { productName, category, targetBuyer, sourceUrl, sourceImages, verifiedFeatures, preset } };
}

export function derivePackStatus(statuses: string[]) {
  const ready = statuses.filter((s) => s === "ready").length;
  const failed = statuses.filter((s) => s === "failed").length;
  const active = statuses.some((s) => s === "processing" || s === "pending");
  if (ready === COMMERCE_ROLES.length) return "ready";
  if (active) return "processing";
  if (ready > 0 && failed > 0) return "partial";
  if (failed === COMMERCE_ROLES.length) return "failed";
  return "draft";
}
