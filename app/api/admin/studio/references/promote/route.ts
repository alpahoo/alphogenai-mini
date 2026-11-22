import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";
import { TOMBSTONE_FILTER } from "@/lib/comfy/tombstone";
import { EXT_BY_MIME, cleanName } from "@/lib/studio/reference-library";
import { MAX_LIBRARY_IMAGE_BYTES, saveToLibrary } from "@/lib/studio/reference-library-store";

/**
 * POST { asset_id, name }: copy one finished image result of the signed-in administrator (for example a MOSS image)
 * into the permanent reference library, so a video model can use it as its first frame.
 *
 * Read only toward generation: no GPU call, no reservation, no gate, no budget, no RPC. The result file is only read.
 * The copy is an independent library image (same rules as any library image: named, 60 maximum, deleted only by the
 * administrator with a confirmation, never by deleting the run it came from).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });

export async function POST(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const { asset_id: assetId, name: rawName } = (body && typeof body === "object" ? body : {}) as { asset_id?: unknown; name?: unknown };
  if (typeof assetId !== "string" || !UUID.test(assetId)) return json({ error: "Invalid image" }, 400);
  const name = cleanName(rawName);
  if (!name) return json({ error: "Give the reference a name (1 to 40 characters)" }, 400);

  const db = createServiceClient();
  // Ownership: the asset, then its run, must both belong to the caller; anything else answers exactly like a missing image.
  const { data: asset } = await db.from("comfy_assets").select("storage_key,run_id,mime").eq("id", assetId).eq("owner_id", auth.user.id).is("withdrawn_at", null).single();
  if (!asset) return json({ error: "Image not found" }, 404);
  const { data: run } = await db.from("comfy_runs").select("status").eq("id", asset.run_id).eq("user_id", auth.user.id).is(TOMBSTONE_FILTER, null).single();
  if (run?.status !== "done") return json({ error: "Image not found" }, 404);
  if (!(String(asset.mime) in EXT_BY_MIME)) return json({ error: "Only image results can be used as a reference" }, 400);

  const { data: blob, error } = await db.storage.from("comfy-outputs").download(String(asset.storage_key));
  if (error || !blob) return json({ error: "The image could not be read" }, 503);
  if (blob.size > MAX_LIBRARY_IMAGE_BYTES) return json({ error: "Image must be 10 MB or less" }, 400);

  const saved = await saveToLibrary(db, auth.user.id, Buffer.from(await blob.arrayBuffer()), name);
  return saved.ok ? json({ item: saved.item }, 201) : json({ error: saved.error }, saved.status);
}
