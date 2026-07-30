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

function displayCopy(value: string | undefined, fallback: string, max = 44): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim() || fallback;
  if (normalized.length <= max) return normalized;

  const beforeSeparator = normalized.split(/\s(?:[-–—|])\s/, 1)[0]?.trim();
  if (beforeSeparator && beforeSeparator.length >= 12 && beforeSeparator.length <= max) {
    return `${beforeSeparator.replace(/[.,;:!?]+$/, "")}.`;
  }

  const words = normalized.split(" ");
  let compact = "";
  for (const word of words) {
    const candidate = compact ? `${compact} ${word}` : word;
    if (candidate.length > max - 1) break;
    compact = candidate;
  }
  return `${(compact || fallback.slice(0, max - 1)).replace(/[.,;:!?]+$/, "")}.`;
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
        caption: displayCopy(input.captions?.[0], title),
      },
      {
        videoUrl: demo.videoUrl,
        durationSeconds: demo.durationSeconds,
        eyebrow: "LE PRODUIT",
        headline: benefit,
        caption: displayCopy(input.captions?.[1], benefit),
      },
      {
        videoUrl: cta.videoUrl,
        durationSeconds: cta.durationSeconds,
        eyebrow: "PRET A BOUGER",
        headline: title,
        caption: displayCopy(input.captions?.[2], title),
        cta: input.cta ?? "Decouvrir",
      },
    ],
    brand: input.brand ?? "AlphoGen",
    accentColor: input.accentColor ?? "#36d399",
    ...(input.voiceoverUrl ? { voiceoverUrl: input.voiceoverUrl } : {}),
    ...(input.productImageUrl ? { productImageUrl: input.productImageUrl } : {}),
  };
}
