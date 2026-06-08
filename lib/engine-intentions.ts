/**
 * Product-facing framing for the technical engine layer (T-102).
 *
 * Pure helpers — NO backend / route / provider logic. They only translate engine
 * capabilities into:
 *   - a simple product intention ("Realistic character", "Avatar", ...) for the
 *     model selector, so users choose an outcome, not a provider/model id;
 *   - an asset compatibility status relative to the selected engine, so users
 *     understand why a face/image works (or not) with the current model.
 *
 * The real engine key is still what gets sent to the API — this is display-only.
 */

export interface EngineLike {
  key: string;
  label: string;
  supportsRefs: boolean;
  supportsI2v: boolean;
  quality: string;
}

/** Lead the model option with an outcome ("Realistic character") then the
 *  clean model name as a differentiator. Never exposes scary internals. */
export function getEngineIntention(opt: EngineLike): string {
  const k = (opt.key || "").toLowerCase();
  const l = (opt.label || "").toLowerCase();

  if (k.includes("heygen") || l.includes("avatar")) return "Avatar — your face speaks";
  if (k.includes("fast") || l.includes("fast")) return "Fast draft";
  if (opt.supportsRefs) return "Realistic character";
  if (opt.quality === "1080p" || opt.quality === "1440p" || opt.quality === "2160p")
    return "Cinematic HD";
  return "General video";
}

// ── Asset compatibility (relative to the selected engine) ───────────────────

export type CompatTone = "ok" | "warn" | "muted";

export interface AssetCompat {
  label: string;
  tone: CompatTone;
}

/** What the selected engine can do, from the UI's point of view. */
export interface EngineCompatContext {
  /** No specific engine picked yet — be optimistic. */
  isAuto: boolean;
  /** BytePlus Seedance 2.0 family — consumes verified faces via asset://. */
  isBytePlus2: boolean;
  /** Accepts character references at all (raw uploads on Kling/Atlas/Wan, etc.). */
  supportsRefs: boolean;
}

/** Status for a verified BytePlus face (asset://). It only works on BytePlus 2.0. */
export function faceCompat(ctx: EngineCompatContext): AssetCompat {
  if (ctx.isAuto) return { label: "Ready", tone: "ok" };
  if (ctx.isBytePlus2) return { label: "Ready", tone: "ok" };
  return { label: "BytePlus 2.0 only", tone: "muted" };
}

/** Status for an uploaded raw image (not a verified face). */
export function uploadCompat(ctx: EngineCompatContext): AssetCompat {
  if (ctx.isAuto) return { label: "Ready", tone: "ok" };
  // BytePlus rejects raw photos of real people; objects/scenes are fine.
  if (ctx.isBytePlus2) return { label: "No real faces here", tone: "warn" };
  if (ctx.supportsRefs) return { label: "Works here", tone: "ok" };
  return { label: "Not used by this model", tone: "muted" };
}

/** Tailwind classes for a compatibility badge tone. */
export function compatToneClass(tone: CompatTone): string {
  switch (tone) {
    case "ok":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "warn":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    default:
      return "bg-muted text-muted-foreground/70";
  }
}
