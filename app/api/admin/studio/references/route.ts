import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";
import { MAX_LIBRARY_ITEMS, cleanName, libraryPath, thumbPath, type LibraryItem } from "@/lib/studio/reference-library";
import { MAX_LIBRARY_IMAGE_BYTES, listLibraryFiles, saveToLibrary } from "@/lib/studio/reference-library-store";

// Permanent reference library of the signed-in administrator: files in the private `references` bucket under
// `<user_id>/library/`. Admin only; the folder is always built from the session, never from the request.
// Nothing here starts a generation, takes a reservation or touches a gate.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE = ["queued", "running"];
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });

export async function GET() {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const db = createServiceClient();
  const files = await listLibraryFiles(db, auth.user.id);
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
  if (file.size > MAX_LIBRARY_IMAGE_BYTES) return json({ error: "Image must be 10 MB or less" }, 400);
  const saved = await saveToLibrary(createServiceClient(), auth.user.id, Buffer.from(await file.arrayBuffer()), name);
  return saved.ok ? json({ item: saved.item }, 201) : json({ error: saved.error }, saved.status);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ error: "Invalid reference" }, 400);
  const db = createServiceClient();
  const files = await listLibraryFiles(db, auth.user.id);
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
