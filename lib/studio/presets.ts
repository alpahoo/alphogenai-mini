import type { ParamValues } from "./manifest";

/**
 * Phase A presets: stored in this browser only (localStorage), per model.
 * A server-side preset table belongs to the Sessions/Projects phase.
 */
export interface Preset { id: string; name: string; model: string; values: ParamValues; createdAt: string }

const KEY = "alphogen.studio.presets.v1";

function readAll(): Preset[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isPreset) : [];
  } catch { return []; }
}

function writeAll(presets: Preset[]): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(presets)); return true; } catch { return false; }
}

function isPreset(p: unknown): p is Preset {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && typeof o.model === "string" && !!o.values && typeof o.values === "object";
}

export function listPresets(model: string): Preset[] {
  return readAll().filter(p => p.model === model);
}

/** Prompt is excluded: a preset is a set of settings, not a creation. */
export function savePreset(model: string, name: string, values: ParamValues): Preset | null {
  const { prompt: _prompt, ...settings } = values;
  void _prompt;
  const preset: Preset = { id: crypto.randomUUID(), name: name.trim().slice(0, 60) || "Preset", model, values: settings, createdAt: new Date().toISOString() };
  return writeAll([...readAll(), preset]) ? preset : null;
}

export function deletePreset(id: string): void {
  writeAll(readAll().filter(p => p.id !== id));
}
