import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/flags";

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
/** Stored setting of one module: off, on for everybody, or on for the administrators only (first activation). */
export type ModuleMode = boolean | "admin";
export type ModuleModes = Record<ParallaxModuleId, ModuleMode>;
/** Whoever is asking: only the e-mail matters (administrators are decided by NEXT_PUBLIC_ADMIN_EMAILS, like everywhere else). */
export type ModuleViewer = { email?: string | null } | null | undefined;

export const defaultModuleStates = (): ModuleStates =>
  Object.fromEntries(
    Object.entries(PARALLAX_MODULES).map(([id, definition]) => [id, definition.defaultEnabled]),
  ) as ModuleStates;

export const isModuleMode = (value: unknown): value is ModuleMode => typeof value === "boolean" || value === "admin";

export function sanitizeModes(value: unknown): ModuleModes {
  const result: ModuleModes = { ...defaultModuleStates() };
  if (!value || typeof value !== "object") return result;
  for (const id of Object.keys(PARALLAX_MODULES) as ParallaxModuleId[]) {
    const candidate = (value as Record<string, unknown>)[id];
    if (isModuleMode(candidate)) result[id] = candidate;
  }
  return result;
}

/** What one viewer sees: "admin" counts as enabled only for an administrator. Anyone else (or nobody) gets false. */
export function resolveModuleStates(modes: ModuleModes, viewer?: ModuleViewer): ModuleStates {
  const admin = isAdminEmail(viewer?.email);
  return Object.fromEntries(
    (Object.keys(PARALLAX_MODULES) as ParallaxModuleId[]).map((id) => [id, modes[id] === true || (modes[id] === "admin" && admin)]),
  ) as ModuleStates;
}

export async function getModuleModes(): Promise<ModuleModes> {
  try {
    const service = createServiceClient();
    const { data, error } = await service.from("app_settings").select("value").eq("key", "parallax_modules").maybeSingle();
    if (error) console.error("parallax_modules_read_failed", error.code ?? "unknown");
    return sanitizeModes(data?.value);
  } catch {
    return sanitizeModes(null);
  }
}

export async function getModuleStates(viewer?: ModuleViewer): Promise<ModuleStates> {
  return resolveModuleStates(await getModuleModes(), viewer);
}

export async function isModuleEnabled(id: ParallaxModuleId, viewer?: ModuleViewer): Promise<boolean> {
  return (await getModuleStates(viewer))[id];
}

export function isParallaxModuleId(value: unknown): value is ParallaxModuleId {
  return typeof value === "string" && value in PARALLAX_MODULES;
}

