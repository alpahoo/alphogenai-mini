/**
 * Permanent reference-image library (Phase 2), independent from the generation history.
 *
 * No table and no migration: a reference is a file in the existing private `references` bucket under
 * `<user_id>/library/<hex(name)>_<uuid>.<ext>`, with a 256 px thumbnail under `<user_id>/library/thumbs/`.
 * The name is hex-encoded in the file name so the path stays within what the run API already accepts
 * (letters, digits, underscore, slash, dash and a png/jpg/webp extension) and the bucket's folder isolation
 * (first folder = owner) still applies. A table (name, role, tags) would be cleaner if characters grow more
 * complex; it is not needed for this scope.
 *
 * Pure functions only: no network, no storage.
 */
export const LIBRARY_DIR = "library";
export const THUMB_DIR = "thumbs";
export const MAX_LIBRARY_ITEMS = 60;
export const MAX_NAME_LENGTH = 40;
export const EXT_BY_MIME: Record<string, "png" | "jpg" | "webp"> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE = new RegExp(`^((?:[0-9a-f]{2})+)_(${UUID})\\.(png|jpg|webp)$`);

export interface LibraryFileInfo { id: string; name: string; ext: "png" | "jpg" | "webp"; fileName: string }

const toHex = (s: string) => Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16)));

/** Trimmed name, 1 to 40 characters, no control characters. Null when invalid. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export function fileNameFor(name: string, id: string, ext: "png" | "jpg" | "webp"): string { return `${toHex(name)}_${id}.${ext}`; }
export const libraryPath = (userId: string, fileName: string) => `${userId}/${LIBRARY_DIR}/${fileName}`;
export const thumbPath = (userId: string, fileName: string) => `${userId}/${LIBRARY_DIR}/${THUMB_DIR}/${fileName.replace(/\.(png|jpg|webp)$/, ".webp")}`;

/** Decode a library file name. Null for anything that is not a well-formed library file (folders, thumbnails, strays). */
export function parseFileName(fileName: string): LibraryFileInfo | null {
  const m = FILE.exec(fileName);
  if (!m) return null;
  try { return { id: m[2], name: fromHex(m[1]), ext: m[3] as LibraryFileInfo["ext"], fileName }; } catch { return null; }
}

/** True for a path inside the caller's own library. Used to protect library files from automatic cleanup. */
export function isLibraryPath(userId: string, path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith(`${userId}/${LIBRARY_DIR}/`) && !path.includes("..");
}

export interface LibraryItem { id: string; name: string; path: string; thumb_url: string | null; created_at: string | null }
