import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";
import { TOMBSTONE_FILTER } from "@/lib/comfy/tombstone";
import { modelForTemplateVersion } from "@/lib/studio/catalog";
import { buildMontage } from "@/lib/montage/build";
import { MontageError } from "@/lib/montage/mp4-info";
import {
  MAX_CLIP_BYTES, MAX_MONTAGES, MAX_MONTAGE_CLIPS, MAX_TOTAL_INPUT_BYTES, MIN_MONTAGE_CLIPS, MONTAGE_DIR,
  montageDownloadName, montageFileName, montageName, montagePath, parseMontageFileName, type MontageItem,
} from "@/lib/montage/files";

/**
 * Montages of the signed-in administrator: finished video generations joined in the order given, with their sound.
 *
 *   GET                 list (newest first), with a short-lived signed link to play each one
 *   GET ?id=&download=1 a short-lived signed link that downloads one
 *   POST { run_ids, audio?, name? }  build one: audio "corrected" (default) or "original"
 *   DELETE ?id=         delete one (the administrator confirms in the interface)
 *
 * Read only toward generation: no GPU call, no run, no reservation, no gate, no budget, no RPC. The clips are read
 * from the output bucket and never modified; the montage is a new private file. Runs, jobs and finance are untouched.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
type Db = ReturnType<typeof createServiceClient>;

async function listFiles(db: Db, userId: string) {
  const { data, error } = await db.storage.from("comfy-outputs").list(`${userId}/${MONTAGE_DIR}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error) return null;
  return (data ?? []).flatMap(f => { const info = parseMontageFileName(f.name); return info ? [{ info, created_at: (f.created_at as string | null) ?? null, bytes: (f.metadata as { size?: number } | null)?.size ?? null }] : []; });
}

export async function GET(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const db = createServiceClient();
  const files = await listFiles(db, auth.user.id);
  if (!files) return json({ error: "Montages unavailable" }, 503);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id !== null) {
    const f = UUID.test(id) ? files.find(x => x.info.id === id.toLowerCase()) : undefined;
    if (!f) return json({ error: "Montage not found" }, 404);
    const signed = await db.storage.from("comfy-outputs").createSignedUrl(montagePath(auth.user.id, f.info.fileName), 600, url.searchParams.get("download") === "1" ? { download: montageDownloadName(f.info.name, f.info.id) } : undefined);
    if (signed.error || !signed.data) return json({ error: "Montage unavailable" }, 503);
    return json({ url: signed.data.signedUrl, expires_in: 600 });
  }
  const paths = files.map(f => montagePath(auth.user.id, f.info.fileName));
  const signed = paths.length ? await db.storage.from("comfy-outputs").createSignedUrls(paths, 600) : { data: [], error: null };
  const urlFor = new Map((signed.data ?? []).map(s => [s.path, s.signedUrl]));
  const items: MontageItem[] = files.map((f, i) => ({ id: f.info.id, name: f.info.name, created_at: f.created_at, bytes: f.bytes, url: urlFor.get(paths[i]) ?? null }));
  return json({ items, max: MAX_MONTAGES });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const { run_ids: runIds, audio, name: rawName } = (body && typeof body === "object" ? body : {}) as { run_ids?: unknown; audio?: unknown; name?: unknown };
  if (!Array.isArray(runIds) || runIds.length < MIN_MONTAGE_CLIPS || runIds.length > MAX_MONTAGE_CLIPS || !runIds.every(r => typeof r === "string" && UUID.test(r)))
    return json({ error: `Choose ${MIN_MONTAGE_CLIPS} to ${MAX_MONTAGE_CLIPS} finished video generations` }, 400);
  const ids = runIds.map(r => String(r).toLowerCase());
  if (new Set(ids).size !== ids.length) return json({ error: "Each generation can appear only once in a montage" }, 400);
  if (audio !== undefined && audio !== "corrected" && audio !== "original") return json({ error: "Audio must be corrected or original" }, 400);
  const role = audio === "original" ? "raw" : "final";
  const name = montageName(rawName);
  if (!name) return json({ error: "Give the montage a name (1 to 40 characters)" }, 400);

  const db = createServiceClient();
  const existing = await listFiles(db, auth.user.id);
  if (!existing) return json({ error: "Montages unavailable" }, 503);
  if (existing.length >= MAX_MONTAGES) return json({ error: `You already have ${MAX_MONTAGES} montages. Delete one first.` }, 409);

  // Every clip: the run and its file must belong to the caller, be finished, not deleted, and be a video.
  const { data: runs, error: runError } = await db.from("comfy_runs").select("id,status,template_version").in("id", ids).eq("user_id", auth.user.id).is(TOMBSTONE_FILTER, null);
  if (runError) return json({ error: "Generations unavailable" }, 503);
  const runById = new Map((runs ?? []).map(r => [String(r.id), r]));
  const { data: assets, error: assetError } = await db.from("comfy_assets").select("id,run_id,role,mime,storage_key").in("run_id", ids).eq("owner_id", auth.user.id).eq("role", role).is("withdrawn_at", null);
  if (assetError) return json({ error: "Generations unavailable" }, 503);
  const assetByRun = new Map((assets ?? []).map(a => [String(a.run_id), a]));
  for (const [i, id] of ids.entries()) {
    const run = runById.get(id), asset = assetByRun.get(id);
    if (!run || run.status !== "done" || modelForTemplateVersion(run.template_version as string | null).kind !== "video" || !asset)
      return json({ error: `Generation ${i + 1} is not a finished video of yours` }, 404);
    if (asset.mime !== "video/mp4") return json({ error: `Generation ${i + 1} is not a video file` }, 400);
  }

  // Read the clips, one at a time, bounded in size.
  const clips: Uint8Array[] = []; let total = 0;
  for (const id of ids) {
    const asset = assetByRun.get(id)!;
    const { data: blob, error } = await db.storage.from("comfy-outputs").download(String(asset.storage_key));
    if (error || !blob) return json({ error: "A clip could not be read" }, 503);
    if (blob.size > MAX_CLIP_BYTES || (total += blob.size) > MAX_TOTAL_INPUT_BYTES) return json({ error: "These clips are too large to join here" }, 400);
    clips.push(new Uint8Array(await blob.arrayBuffer()));
  }

  let built;
  try { built = await buildMontage(clips); }
  catch (e) {
    if (e instanceof MontageError) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: "The montage could not be built." }, 500);
  }

  const montageId = uuidv4();
  const path = montagePath(auth.user.id, montageFileName(name, montageId));
  const up = await db.storage.from("comfy-outputs").upload(path, built.bytes, { contentType: "video/mp4", upsert: false });
  if (up.error) return json({ error: "Storage upload failed" }, 503);
  const signed = await db.storage.from("comfy-outputs").createSignedUrl(path, 600);
  const item: MontageItem = { id: montageId, name, created_at: new Date().toISOString(), bytes: built.bytes.length, url: signed.data?.signedUrl ?? null };
  return json({ item, frames: built.frames, duration_s: Number(built.durationS.toFixed(3)), clips: built.clips, audio: role === "raw" ? "original" : "corrected" }, 201);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ error: "Invalid montage" }, 400);
  const db = createServiceClient();
  const files = await listFiles(db, auth.user.id);
  if (!files) return json({ error: "Montages unavailable" }, 503);
  const f = files.find(x => x.info.id === id.toLowerCase());
  if (!f) return json({ error: "Montage not found" }, 404);
  const removed = await db.storage.from("comfy-outputs").remove([montagePath(auth.user.id, f.info.fileName)]);
  if (removed.error) return json({ error: "Could not delete the montage" }, 503);
  return json({ deleted: true });
}
