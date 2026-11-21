import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { fromBuffer as detectFromBuffer } from "file-type";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";
import {
  EXT_BY_MIME, LIBRARY_DIR, MAX_LIBRARY_ITEMS, cleanName, fileNameFor, libraryPath, parseFileName, thumbPath, type LibraryItem,
} from "@/lib/studio/reference-library";

// Permanent reference library of the signed-in administrator: files in the private `references` bucket under
// `<user_id>/library/`. Admin only; the folder is always built from the session, never from the request.
// Nothing here starts a generation, takes a reservation or touches a gate.

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 64 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE = ["queued", "running"];
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });

type Db = ReturnType<typeof createServiceClient>;

async function listFiles(db: Db, userId: string) {
  const { data, error } = await db.storage.from("references").list(`${userId}/${LIBRARY_DIR}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error) return null;
  return (data ?? []).flatMap(f => { const info = parseFileName(f.name); return info ? [{ info, created_at: (f.created_at as string | null) ?? null }] : []; });
}

export async function GET() {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const db = createServiceClient();
  const files = await listFiles(db, auth.user.id);
  if (!files) return json({ error: "Library unavailable" }, 503);
  const thumbs = files.map(f => thumbPath(auth.user.id, f.info.fileName));
  const signed = thumbs.length ? await db.storage.from("references").createSignedUrls(thumbs, 3600) : { data: [], error: null };
  const urlFor = new Map((signed.data ?? []).map(s => [s.path, s.signedUrl]));
  const items: LibraryItem[] = files.map((f, i) => ({
    id: f.info.id, name: f.info.name, path: libraryPath(auth.user.id, f.info.fileName), created_at: f.created_at, thumb_url: urlFor.get(thumbs[i]) ?? null,
  }));
  return json({ items, max: MAX_LIBRARY_ITEMS });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Invalid upload" }, 400); }
  const file = form.get("file");
  const name = cleanName(form.get("name"));
  if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
  if (!name) return json({ error: "Give the reference a name (1 to 40 characters)" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "Image must be 10 MB or less" }, 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await detectFromBuffer(buffer);
  const ext = detected ? EXT_BY_MIME[detected.mime] : undefined;
  if (!detected || !ext) return json({ error: "Use a PNG, JPEG or WebP image" }, 400);

  const db = createServiceClient();
  const existing = await listFiles(db, auth.user.id);
  if (!existing) return json({ error: "Library unavailable" }, 503);
  if (existing.length >= MAX_LIBRARY_ITEMS) return json({ error: `The library is full (${MAX_LIBRARY_ITEMS} images). Delete one first.` }, 409);
  if (existing.some(f => f.info.name.toLowerCase() === name.toLowerCase())) return json({ error: "A reference with this name already exists" }, 409);

  let thumb: Buffer;
  try {
    const sharp = (await import("sharp")).default;
    thumb = await sharp(buffer, { failOn: "warning", limitInputPixels: MAX_PIXELS }).rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
  } catch { return json({ error: "This image could not be read" }, 422); }

  const fileName = fileNameFor(name, uuidv4(), ext);
  const path = libraryPath(auth.user.id, fileName), tpath = thumbPath(auth.user.id, fileName);
  const up = await db.storage.from("references").upload(path, buffer, { contentType: detected.mime, upsert: false });
  if (up.error) return json({ error: "Storage upload failed" }, 503);
  const tu = await db.storage.from("references").upload(tpath, thumb, { contentType: "image/webp", upsert: false });
  if (tu.error) { await db.storage.from("references").remove([path]); return json({ error: "Storage upload failed" }, 503); }
  const signed = await db.storage.from("references").createSignedUrl(tpath, 3600);
  const info = parseFileName(fileName)!;
  const item: LibraryItem = { id: info.id, name, path, thumb_url: signed.data?.signedUrl ?? null, created_at: new Date().toISOString() };
  return json({ item }, 201);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ error: "Invalid reference" }, 400);
  const db = createServiceClient();
  const files = await listFiles(db, auth.user.id);
  if (!files) return json({ error: "Library unavailable" }, 503);
  const target = files.find(f => f.info.id === id.toLowerCase());
  if (!target) return json({ error: "Reference not found" }, 404);
  const path = libraryPath(auth.user.id, target.info.fileName);
  // A queued or running generation still needs the file: the executor downloads it when it starts.
  const { data: busy, error } = await db.from("comfy_runs").select("id").eq("user_id", auth.user.id).eq("reference_path", path).in("status", ACTIVE).limit(1);
  if (error) return json({ error: "Could not check running generations; nothing was deleted" }, 503);
  if (busy?.length) return json({ error: "A running generation is using this reference. Try again when it finishes." }, 409);
  const removed = await db.storage.from("references").remove([path, thumbPath(auth.user.id, target.info.fileName)]);
  if (removed.error) return json({ error: "Could not delete the reference" }, 503);
  return json({ deleted: true });
}
