import type { ParamValues, StudioManifest } from "./manifest";

/**
 * Carries a prepared draft from one Studio screen to another in the same tab (Video screen -> full Studio), so following
 * "More settings" does not discard the prompt, settings and first frame. Session storage only: never sent to the server,
 * consumed once, ignored after a few minutes or for another model.
 */
export const HANDOFF_KEY = "alphogen.studio.handoff";
export const HANDOFF_MAX_AGE_MS = 10 * 60_000;

export interface HandoffReference { path: string; previewUrl: string; name: string }
export interface StudioHandoff { model: string; values: ParamValues; reference: HandoffReference | null; at: number }

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const sessionStore = (): Store | null => { try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; } };

export function saveHandoff(draft: Omit<StudioHandoff, "at">, store: Store | null = sessionStore(), now = Date.now()): void {
  try { store?.setItem(HANDOFF_KEY, JSON.stringify({ ...draft, at: now })); } catch { /* storage blocked: the link still works */ }
}

/** Reads and removes the draft. Keeps only the keys the manifest declares, with primitive values. */
export function takeHandoff(model: string, manifest: StudioManifest, store: Store | null = sessionStore(), now = Date.now()):
  { values: ParamValues; reference: HandoffReference | null } | null {
  let raw: string | null = null;
  try { raw = store?.getItem(HANDOFF_KEY) ?? null; store?.removeItem(HANDOFF_KEY); } catch { return null; }
  if (!raw) return null;
  let d: Partial<StudioHandoff>;
  try { d = JSON.parse(raw); } catch { return null; }
  if (d.model !== model || typeof d.at !== "number" || now - d.at > HANDOFF_MAX_AGE_MS || now < d.at) return null;
  const values: ParamValues = {};
  for (const p of manifest.params) {
    const v = (d.values as Record<string, unknown> | undefined)?.[p.key];
    if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) values[p.key] = v;
  }
  const r = d.reference;
  const reference = r && typeof r.path === "string" && typeof r.previewUrl === "string" && typeof r.name === "string"
    ? { path: r.path, previewUrl: r.previewUrl, name: r.name } : null;
  return { values, reference };
}
