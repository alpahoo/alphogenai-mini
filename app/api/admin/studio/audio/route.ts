import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { fromBuffer as detectFromBuffer } from "file-type";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";
import {
  AUDIO_DIR, EXT_BY_AUDIO_MIME, MAX_AUDIO_BYTES, MAX_AUDIO_ITEMS, MAX_AUDIO_SECONDS, MIN_AUDIO_SECONDS,
  audioFileName, audioPath, cleanAudioName, parseAudioFileName, wavDurationSeconds, type AudioItem,
} from "@/lib/avatar/audio-library";

// Private audio library of the signed-in administrator (talking-avatar inputs): files in the private `references`
// bucket under `<user_id>/audio-library/`. Admin only; the folder is always built from the session, never from the
// request. Nothing here starts a generation, takes a reservation or touches a gate.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE = ["queued", "running"];
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });

type Db = ReturnType<typeof createServiceClient>;

async function listFiles(db: Db, userId: string) {
  const { data, error } = await db.storage.from("references").list(`${userId}/${AUDIO_DIR}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error) return null;
  return (data ?? []).flatMap(f => { const info = parseAudioFileName(f.name); return info ? [{ info, created_at: (f.created_at as string | null) ?? null }] : []; });
}

export async function GET() {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const db = createServiceClient();
  const files = await listFiles(db, auth.user.id);
  if (!files) return json({ error: "Audio library unavailable" }, 503);
  const paths = files.map(f => audioPath(auth.user.id, f.info.fileName));
  // Short-lived signed links so the admin can listen before choosing; never public.
  const signed = paths.length ? await db.storage.from("references").createSignedUrls(paths, 3600) : { data: [], error: null };
  const urlFor = new Map((signed.data ?? []).map(s => [s.path, s.signedUrl]));
  const items: (AudioItem & { url: string | null })[] = files.map((f, i) => ({
    id: f.info.id, name: f.info.name, ext: f.info.ext, path: paths[i], created_at: f.created_at, url: urlFor.get(paths[i]) ?? null,
  }));
  return json({ items, max: MAX_AUDIO_ITEMS, max_seconds: MAX_AUDIO_SECONDS });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Invalid upload" }, 400); }
  const file = form.get("file");
  const name = cleanAudioName(form.get("name"));
  if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
  if (!name) return json({ error: "Give the audio a name (1 to 40 characters)" }, 400);
  if (file.size > MAX_AUDIO_BYTES) return json({ error: "Audio must be 3 MB or less" }, 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await detectFromBuffer(buffer);
  const ext = detected ? EXT_BY_AUDIO_MIME[detected.mime] : undefined;
  if (!detected || !ext) return json({ error: "Use a WAV or MP3 file" }, 400);
  // WAV: exact check now. MP3: measured by the executor's CPU broker before any GPU starts (clear error, no GPU cost).
  if (ext === "wav") {
    const seconds = wavDurationSeconds(buffer);
    if (seconds === null) return json({ error: "This WAV file could not be read" }, 422);
    if (seconds < MIN_AUDIO_SECONDS || seconds > MAX_AUDIO_SECONDS) return json({ error: `Audio must last between ${MIN_AUDIO_SECONDS} and ${MAX_AUDIO_SECONDS} seconds` }, 400);
  }

  const db = createServiceClient();
  const existing = await listFiles(db, auth.user.id);
  if (!existing) return json({ error: "Audio library unavailable" }, 503);
  if (existing.length >= MAX_AUDIO_ITEMS) return json({ error: `The audio library is full (${MAX_AUDIO_ITEMS} files). Delete one first.` }, 409);
  if (existing.some(f => f.info.name.toLowerCase() === name.toLowerCase())) return json({ error: "An audio with this name already exists" }, 409);

  const fileName = audioFileName(name, uuidv4(), ext);
  const path = audioPath(auth.user.id, fileName);
  const up = await db.storage.from("references").upload(path, buffer, { contentType: ext === "wav" ? "audio/wav" : "audio/mpeg", upsert: false });
  if (up.error) return json({ error: "Storage upload failed" }, 503);
  const signed = await db.storage.from("references").createSignedUrl(path, 3600);
  const info = parseAudioFileName(fileName)!;
  const item = { id: info.id, name, ext, path, created_at: new Date().toISOString(), url: signed.data?.signedUrl ?? null };
  return json({ item }, 201);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ error: "Invalid audio" }, 400);
  const db = createServiceClient();
  const files = await listFiles(db, auth.user.id);
  if (!files) return json({ error: "Audio library unavailable" }, 503);
  const target = files.find(f => f.info.id === id.toLowerCase());
  if (!target) return json({ error: "Audio not found" }, 404);
  const path = audioPath(auth.user.id, target.info.fileName);
  // A queued or running render still needs the file: the executor's broker downloads it when it starts. The audio path
  // lives only in the stored descriptor, so the (at most one) active avatar run of this admin is checked there.
  const { data: active, error } = await db.from("comfy_runs").select("id").eq("user_id", auth.user.id).eq("runtime", "longcat-avatar@1").in("status", ACTIVE);
  if (error) return json({ error: "Could not check running renders; nothing was deleted" }, 503);
  for (const run of (active ?? []) as { id: string }[]) {
    const { data: graph, error: graphError } = await db.from("comfy_run_graphs").select("resolved_graph").eq("run_id", run.id).single();
    if (graphError) return json({ error: "Could not check running renders; nothing was deleted" }, 503);
    const used = (graph?.resolved_graph as Record<string, { inputs?: Record<string, unknown> }> | undefined)?.["1"]?.inputs?.audio_path;
    if (used === path) return json({ error: "A running render is using this audio. Try again when it finishes." }, 409);
  }
  const removed = await db.storage.from("references").remove([path]);
  if (removed.error) return json({ error: "Could not delete the audio" }, 503);
  return json({ deleted: true });
}
