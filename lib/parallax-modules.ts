import { createServiceClient } from "@/lib/supabase/service";

export const PARALLAX_MODULES = {
  alphogenai_clipping: {
    label: "AlphoGenAI — Clipping",
    description: "Extraire des clips d’une vidéo existante",
    defaultEnabled: true,
  },
  parallax_shorts: {
    label: "Parallax — Shorts",
    description: "Créer une vidéo verticale depuis une idée",
    defaultEnabled: false,
  },
  alphogenai_podcast: {
    label: "AlphoGenAI — Podcast Studio",
    description: "Produire et monter des épisodes",
    defaultEnabled: true,
  },
  parallax_audio: {
    label: "Parallax — Audio",
    description: "Texte → voix et musique",
    defaultEnabled: false,
  },
  parallax_remix: {
    label: "Parallax — Remix",
    description: "Réutiliser une référence vidéo privée",
    defaultEnabled: false,
  },
} as const;

export type ParallaxModuleId = keyof typeof PARALLAX_MODULES;
export type ModuleStates = Record<ParallaxModuleId, boolean>;

export const defaultModuleStates = (): ModuleStates =>
  Object.fromEntries(
    Object.entries(PARALLAX_MODULES).map(([id, definition]) => [id, definition.defaultEnabled]),
  ) as ModuleStates;

function sanitizeStates(value: unknown): ModuleStates {
  const result = defaultModuleStates();
  if (!value || typeof value !== "object") return result;
  for (const id of Object.keys(PARALLAX_MODULES) as ParallaxModuleId[]) {
    const candidate = (value as Record<string, unknown>)[id];
    if (typeof candidate === "boolean") result[id] = candidate;
  }
  return result;
}

export async function getModuleStates(): Promise<ModuleStates> {
  try {
    const service = createServiceClient();
    const { data } = await service.from("app_settings").select("value").eq("key", "parallax_modules").maybeSingle();
    return sanitizeStates(data?.value);
  } catch {
    return defaultModuleStates();
  }
}

export async function isModuleEnabled(id: ParallaxModuleId): Promise<boolean> {
  const states = await getModuleStates();
  return states[id];
}

export function isParallaxModuleId(value: unknown): value is ParallaxModuleId {
  return typeof value === "string" && value in PARALLAX_MODULES;
}

