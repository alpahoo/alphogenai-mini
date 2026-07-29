import { UGC_SHOT_PACK_SIZE, type UGCShotRole } from "@/lib/ugc-shot-provider";

export interface RevideoProductAdShot {
  videoUrl: string;
  durationSeconds: number;
  eyebrow: string;
  headline: string;
  cta?: string;
}

export interface RevideoProductAdManifest {
  shots: [RevideoProductAdShot, RevideoProductAdShot, RevideoProductAdShot];
  brand: string;
  accentColor: string;
  voiceoverUrl?: string;
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
    : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function buildRevideoProductAdManifest(input: {
  productTitle: string;
  productDescription?: string;
  shots: ReadyShot[];
  brand?: string;
  accentColor?: string;
  voiceoverUrl?: string;
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
        eyebrow: "REAL-WORLD TEST",
        headline: title,
      },
      {
        videoUrl: demo.videoUrl,
        durationSeconds: demo.durationSeconds,
        eyebrow: "THE DETAIL",
        headline: benefit,
      },
      {
        videoUrl: cta.videoUrl,
        durationSeconds: cta.durationSeconds,
        eyebrow: "READY TO MOVE",
        headline: title,
        cta: "Discover",
      },
    ],
    brand: input.brand ?? "AlphoGen",
    accentColor: input.accentColor ?? "#36d399",
    ...(input.voiceoverUrl ? { voiceoverUrl: input.voiceoverUrl } : {}),
  };
}
