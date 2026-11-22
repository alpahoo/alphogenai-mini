/**
 * Server-side storage of the permanent reference library: listing and saving an image with its thumbnail.
 * Shared by the upload route and by "use an image result as a reference", so both apply the same rules.
 *
 * Files live in the private `references` bucket under `<user_id>/library/`; the folder always comes from the
 * signed-in administrator, never from a request. Nothing here starts a generation, takes a reservation or
 * touches a gate.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { fromBuffer as detectFromBuffer } from "file-type";
import {
  EXT_BY_MIME, LIBRARY_DIR, MAX_LIBRARY_ITEMS, fileNameFor, libraryPath, parseFileName, thumbPath, type LibraryItem,
} from "./reference-library";

export const MAX_LIBRARY_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 64 * 1024 * 1024;

export async function listLibraryFiles(db: SupabaseClient, userId: string) {
  const { data, error } = await db.storage.from("references").list(`${userId}/${LIBRARY_DIR}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error) return null;
  return (data ?? []).flatMap(f => { const info = parseFileName(f.name); return info ? [{ info, created_at: (f.created_at as string | null) ?? null }] : []; });
}

export type SaveResult = { ok: true; item: LibraryItem } | { ok: false; status: 400 | 409 | 422 | 503; error: string };

/**
 * Validates (size, magic bytes, name, count), makes the 256 px thumbnail, then stores the image and the thumbnail.
 * If the thumbnail cannot be stored the image is removed again: no half-saved reference.
 */
export async function saveToLibrary(db: SupabaseClient, userId: string, buffer: Buffer, name: string): Promise<SaveResult> {
  if (buffer.length > MAX_LIBRARY_IMAGE_BYTES) return { ok: false, status: 400, error: "Image must be 10 MB or less" };
  const detected = await detectFromBuffer(buffer);
  const ext = detected ? EXT_BY_MIME[detected.mime] : undefined;
  if (!detected || !ext) return { ok: false, status: 400, error: "Use a PNG, JPEG or WebP image" };

  const existing = await listLibraryFiles(db, userId);
  if (!existing) return { ok: false, status: 503, error: "Library unavailable" };
  if (existing.length >= MAX_LIBRARY_ITEMS) return { ok: false, status: 409, error: `The library is full (${MAX_LIBRARY_ITEMS} images). Delete one first.` };
  if (existing.some(f => f.info.name.toLowerCase() === name.toLowerCase())) return { ok: false, status: 409, error: "A reference with this name already exists" };

  let thumb: Buffer;
  try {
    const sharp = (await import("sharp")).default;
    thumb = await sharp(buffer, { failOn: "warning", limitInputPixels: MAX_PIXELS }).rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
  } catch { return { ok: false, status: 422, error: "This image could not be read" }; }

  const fileName = fileNameFor(name, uuidv4(), ext);
  const path = libraryPath(userId, fileName), tpath = thumbPath(userId, fileName);
  const up = await db.storage.from("references").upload(path, buffer, { contentType: detected.mime, upsert: false });
  if (up.error) return { ok: false, status: 503, error: "Storage upload failed" };
  const tu = await db.storage.from("references").upload(tpath, thumb, { contentType: "image/webp", upsert: false });
  if (tu.error) { await db.storage.from("references").remove([path]); return { ok: false, status: 503, error: "Storage upload failed" }; }
  const signed = await db.storage.from("references").createSignedUrl(tpath, 3600);
  const info = parseFileName(fileName)!;
  return { ok: true, item: { id: info.id, name, path, thumb_url: signed.data?.signedUrl ?? null, created_at: new Date().toISOString() } };
}
