import { UGC_SHOT_PACK_SIZE, type UGCShotRole } from "@/lib/ugc-shot-provider";

export interface RevideoProductAdShot {
  videoUrl: string;
  durationSeconds: number;
  eyebrow: string;
  headline: string;
  caption: string;
  cta?: string;
}

export interface RevideoProductAdManifest {
  shots: [RevideoProductAdShot, RevideoProductAdShot, RevideoProductAdShot];
  brand: string;
  accentColor: string;
  voiceoverUrl?: string;
  productImageUrl?: string;
}

interface ReadyShot {
  id: string;
  role: UGCShotRole;
  durationSeconds: number;
  videoUrl: string;
}

function boundedCopy(value: string, fallback: string, max = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim() || fallback;
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 3).trimEnd()}...`;
}

export function buildRevideoProductAdManifest(input: {
  productTitle: string;
  productDescription?: string;
  shots: ReadyShot[];
  brand?: string;
  accentColor?: string;
  voiceoverUrl?: string;
  productImageUrl?: string;
  captions?: [string, string, string];
  cta?: string;
}): RevideoProductAdManifest {
  if (input.shots.length !== UGC_SHOT_PACK_SIZE) {
    throw new Error("A Revideo Product Ad manifest requires exactly three ready shots.");
  }

  const byRole = new Map(input.shots.map((shot) => [shot.role, shot]));
  const hook = byRole.get("creator_hook");
  const demo = byRole.get("product_demo");
  const cta = byRole.get("lifestyle_cta");
  if (!hook || !demo || !cta) {
    throw new Error("The three required UGC shot roles must be ready.");
  }

  const title = boundedCopy(input.productTitle, "Made for every move");
  const benefit = boundedCopy(
    input.productDescription ?? "",
    "Built for real life, from the first move to the last."
  );

  return {
    shots: [
      {
        videoUrl: hook.videoUrl,
        durationSeconds: hook.durationSeconds,
        eyebrow: "DECOUVERTE",
        headline: title,
        caption: input.captions?.[0] ?? title,
      },
      {
        videoUrl: demo.videoUrl,
        durationSeconds: demo.durationSeconds,
        eyebrow: "LE PRODUIT",
        headline: benefit,
        caption: input.captions?.[1] ?? benefit,
      },
      {
        videoUrl: cta.videoUrl,
        durationSeconds: cta.durationSeconds,
        eyebrow: "PRET A BOUGER",
        headline: title,
        caption: input.captions?.[2] ?? title,
        cta: input.cta ?? "Decouvrir",
      },
    ],
    brand: input.brand ?? "AlphoGen",
    accentColor: input.accentColor ?? "#36d399",
    ...(input.voiceoverUrl ? { voiceoverUrl: input.voiceoverUrl } : {}),
    ...(input.productImageUrl ? { productImageUrl: input.productImageUrl } : {}),
  };
}
