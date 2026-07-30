import type { ProductPageBrief } from "@/lib/native-product-ad";

export interface DirectedProductAdCopy {
  captions: [string, string, string];
  voiceover: string;
  cta: string;
}

function bounded(value: string, fallback: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim() || fallback;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trimEnd()}...`;
}

export function buildDirectedProductAdCopy(
  brief: ProductPageBrief,
  language = "French (France)"
): DirectedProductAdCopy {
  const product = bounded(brief.title, "ce produit", 52);
  const benefit = bounded(
    brief.description,
    "Pensé pour vous accompagner au quotidien.",
    92
  );

  if (!language.toLowerCase().startsWith("fr")) {
    const captions: [string, string, string] = [
      `Meet ${product}.`,
      benefit,
      `Discover ${product} today.`,
    ];
    return { captions, voiceover: captions.join(" "), cta: "Discover" };
  }

  const captions: [string, string, string] = [
    `Voici ${product}.`,
    benefit,
    `Découvrez ${product} dès maintenant.`,
  ];
  return { captions, voiceover: captions.join(" "), cta: "Découvrir" };
}
