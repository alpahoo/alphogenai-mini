/** Adapted from nickvasilescu/parallax@a98671e3c47fdb12c42789aee821268aa8f23f6c (MIT). */
export const SHORT_MAX_SECONDS = 10;
export const SHORT_ASPECT = "9:16" as const;
export const SHORT_STARTERS = [
  "Une astuce visuelle simple en trois étapes",
  "Un avant/après surprenant en moins de dix secondes",
  "Une mini démonstration produit très rythmée",
];

/**
 * Generation engines offered on the Shorts page, in display order. The first
 * available one is the default. Times and costs were measured on 25 Nov 2026
 * (same first image and prompt, 9:16, 5 s clip, H100) and are indicative only.
 */
export type ShortEngineId = "ltx_2_5" | "wan_i2v" | "h3_turbo_480" | "h3_turbo_704";

export interface ShortEngineOption {
  id: ShortEngineId;
  label: string;
  detail: string;
  available: boolean;
}

export const SHORT_ENGINES: ShortEngineOption[] = [
  { id: "ltx_2_5", label: "LTX-2.5", detail: "704×1280 · son natif · ~1 min 30 par 5 s", available: true },
  { id: "h3_turbo_480", label: "MiniMax H3 Turbo 480p", detail: "480×832 · son natif · ~1 min par 5 s", available: false },
  { id: "h3_turbo_704", label: "MiniMax H3 Turbo 704p", detail: "704×1280 · son natif · ~5 min 30 par 5 s", available: false },
  { id: "wan_i2v", label: "Wan 2.2", detail: "720×1280 · son ajouté après · ~30 min par 5 s", available: true },
];

export const DEFAULT_SHORT_ENGINE: ShortEngineId = "ltx_2_5";

/** Engine actually used for a request: an unknown or not-yet-available choice falls back to the default. */
export function resolveShortEngine(value: unknown): ShortEngineId {
  const option = SHORT_ENGINES.find((e) => e.id === value);
  return option?.available ? option.id : DEFAULT_SHORT_ENGINE;
}

/** LTX-2.5 renders a 10 s Short as one continuous take; other engines keep the 5 s scene split. */
export function shortSceneCount(engine: ShortEngineId): number | undefined {
  return engine === "ltx_2_5" ? 1 : undefined;
}
