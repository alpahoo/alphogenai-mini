/**
 * Where montages live and how they are named. No table, no migration: a montage is one MP4 in the private
 * `comfy-outputs` bucket under `<user_id>/montages/<hex(name)>_<uuid>.mp4`, like the reference library names its
 * images. The folder always comes from the signed-in administrator.
 *
 * Pure functions only.
 */
import { MAX_NAME_LENGTH, cleanName } from "@/lib/studio/reference-library";

export const MONTAGE_DIR = "montages";
export const MIN_MONTAGE_CLIPS = 2;
export const MAX_MONTAGE_CLIPS = 10;
export const MAX_CLIP_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_INPUT_BYTES = 80 * 1024 * 1024;
export const MAX_MONTAGES = 30;
export { MAX_NAME_LENGTH };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE = new RegExp(`^((?:[0-9a-f]{2})+)_(${UUID})\\.mp4$`);

const toHex = (s: string) => Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16)));

export const montageFileName = (name: string, id: string) => `${toHex(name)}_${id}.mp4`;
export const montagePath = (userId: string, fileName: string) => `${userId}/${MONTAGE_DIR}/${fileName}`;

export function parseMontageFileName(fileName: string): { id: string; name: string; fileName: string } | null {
  const m = FILE.exec(fileName);
  if (!m) return null;
  try { return { id: m[2], name: fromHex(m[1]), fileName }; } catch { return null; }
}

/** The name given by the administrator, or a dated default ("Montage 2026-11-22 14:05", UTC). Null when invalid. */
export function montageName(raw: unknown, now: Date = new Date()): string | null {
  if (raw === undefined || raw === null || raw === "") return `Montage ${now.toISOString().slice(0, 16).replace("T", " ")}`;
  return cleanName(raw);
}

/** Download name built by the server, never from a request: letters, digits, dash. */
export function montageDownloadName(name: string, id: string): string {
  const slug = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "montage";
  return `alphogen-${slug}-${id.slice(0, 8)}.mp4`;
}

export interface MontageItem { id: string; name: string; created_at: string | null; bytes: number | null; url: string | null }
