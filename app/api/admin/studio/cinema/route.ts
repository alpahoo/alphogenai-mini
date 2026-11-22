import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";
import { TOMBSTONE_FILTER } from "@/lib/comfy/tombstone";
import { STUDIO_MODELS } from "@/lib/studio/catalog";
import { composeShot, toRunParams, usableReferencePath, type Element } from "@/lib/cinema/compose";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const asText = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
type Db = ReturnType<typeof createServiceClient>;

async function ownedProject(db: Db, user: string, id: unknown) {
  if (!isId(id)) return null;
  const { data } = await db.from("cinema_projects").select("*").eq("id", id).eq("user_id", user).maybeSingle();
  return data;
}
async function ownedShot(db: Db, user: string, id: unknown) {
  if (!isId(id)) return null;
  const { data } = await db.from("cinema_shots").select("*").eq("id", id).eq("user_id", user).maybeSingle();
  return data;
}
async function ownedRun(db: Db, user: string, id: unknown) {
  if (!isId(id)) return null;
  const { data } = await db.from("comfy_runs")
    .select("id,status,template_version,params_effective").eq("id", id).eq("user_id", user).is(TOMBSTONE_FILTER, null).maybeSingle();
  return data;
}

/** Admin-only project list and project storyboard. No GPU, no payment, no deletion. */
export async function GET(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const db = createServiceClient(), user = auth.user.id;
  const projectId = new URL(req.url).searchParams.get("project");
  if (!projectId) {
    const { data, error } = await db.from("cinema_projects").select("id,title,aspect,updated_at")
      .eq("user_id", user).order("updated_at", { ascending: false }).limit(100);
    return error ? json({ error: "Cinema projects unavailable. Migration may still be pending." }, 503) : json({ projects: data ?? [] });
  }
  const project = await ownedProject(db, user, projectId);
  if (!project) return json({ error: "Project not found" }, 404);
  const [sc, sh, el, tk] = await Promise.all([
    db.from("cinema_scenes").select("*").eq("user_id", user).eq("project_id", project.id).order("position"),
    db.from("cinema_shots").select("*").eq("user_id", user).eq("project_id", project.id).order("position"),
    db.from("cinema_elements").select("*").eq("user_id", user).eq("project_id", project.id),
    db.from("cinema_takes").select("*").eq("user_id", user).eq("project_id", project.id).order("created_at"),
  ]);
  if (sc.error || sh.error || el.error || tk.error) return json({ error: "Project data unavailable" }, 503);
  const takes = tk.data ?? [];
  const ids = Array.from(new Set(takes.map(t => String(t.run_id)))).filter(isId);
  let runs: Record<string, unknown>[] = [], assets: Record<string, unknown>[] = [];
  if (ids.length) {
    const [rr, aa] = await Promise.all([
      db.from("comfy_runs").select("id,status,template_version,params_effective,created_at")
        .eq("user_id", user).is(TOMBSTONE_FILTER, null).in("id", ids),
      db.from("comfy_assets").select("id,run_id,role,mime")
        .eq("owner_id", user).is("withdrawn_at", null).in("run_id", ids),
    ]);
    if (rr.error || aa.error) return json({ error: "Take media unavailable" }, 503);
    runs = rr.data ?? []; assets = aa.data ?? [];
  }
  return json({ project, scenes: sc.data ?? [], shots: sh.data ?? [], elements: el.data ?? [], takes, runs, assets });
}

/** Simple owner-scoped operations. Each write is explicitly addressed to one project or shot. */
export async function POST(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  if (Number(req.headers.get("content-length") || 0) > 16_384) return json({ error: "Request too large" }, 413);
  let body: Record<string, unknown>;
  try {
    const input: unknown = await req.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid request" }, 400);
    body = input as Record<string, unknown>;
  } catch { return json({ error: "Invalid JSON" }, 400); }
  const db = createServiceClient(), user = auth.user.id;
  const action = body.action;
  if (action === "project.create") {
    const title = asText(body.title, 120);
    if (!title) return json({ error: "Project title required" }, 400);
    const aspect = body.aspect === "16:9" || body.aspect === "1:1" ? body.aspect : "9:16";
    const { data, error } = await db.from("cinema_projects").insert({ user_id: user, title, aspect }).select("*").single();
    return error || !data ? json({ error: "Project could not be created" }, 503) : json({ project: data }, 201);
  }
  if (action === "scene.create") {
    const project = await ownedProject(db, user, body.project_id);
    if (!project) return json({ error: "Project not found" }, 404);
    const { data: existing, error: readError } = await db.from("cinema_scenes").select("position")
      .eq("project_id", project.id).eq("user_id", user).order("position", { ascending: false }).limit(1);
    if (readError) return json({ error: "Scene unavailable" }, 503);
    const position = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;
    const { data, error } = await db.from("cinema_scenes").insert({
      user_id: user, project_id: project.id, position, title: asText(body.title, 120) || "Scene " + (position + 1),
    }).select("*").single();
    return error ? json({ error: "Could not create scene. Reload and try again." }, 409) : json({ scene: data }, 201);
  }
  if (action === "shot.create") {
    const project = await ownedProject(db, user, body.project_id);
    if (!project || !isId(body.scene_id)) return json({ error: "Scene not found" }, 404);
    const { data: scene } = await db.from("cinema_scenes").select("id")
      .eq("id", body.scene_id).eq("project_id", project.id).eq("user_id", user).maybeSingle();
    if (!scene) return json({ error: "Scene not found" }, 404);
    const { data: existing, error: readError } = await db.from("cinema_shots").select("position")
      .eq("scene_id", scene.id).eq("user_id", user).order("position", { ascending: false }).limit(1);
    if (readError) return json({ error: "Plans unavailable" }, 503);
    const position = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;
    const { data, error } = await db.from("cinema_shots").insert({
      user_id: user, project_id: project.id, scene_id: scene.id, position,
      action: asText(body.description, 2000), duration: 5,
    }).select("*").single();
    return error ? json({ error: "Could not create plan. Reload and try again." }, 409) : json({ shot: data }, 201);
  }
  if (action === "shot.update") {
    const shot = await ownedShot(db, user, body.shot_id);
    if (!shot) return json({ error: "Plan not found" }, 404);
    const expected = body.version;
    if (!Number.isSafeInteger(expected) || expected !== shot.version) return json({ error: "Plan changed elsewhere. Reload before saving." }, 409);
    const path = body.first_frame_path;
    if (path !== undefined && path !== null && (typeof path !== "string" || !usableReferencePath(user, path) || !path.startsWith(user + "/library/")))
      return json({ error: "Invalid private first-frame reference" }, 400);
    const edits: Record<string, unknown> = { version: shot.version + 1, updated_at: new Date().toISOString() };
    if (body.description !== undefined) edits.action = asText(body.description, 2000);
    if (body.first_frame_path !== undefined) edits.first_frame_path = path;
    if (body.duration !== undefined) {
      if (body.duration !== 5 && body.duration !== 10) return json({ error: "H3 supports only 5 or 10 seconds here." }, 400);
      edits.duration = body.duration;
    }
    for (const key of ["size","angle","movement","lens","focus","lighting","mood","sound"]) {
      if (body[key] !== undefined) edits[key] = asText(body[key], key === "sound" ? 1000 : 50);
    }
    const { data, error } = await db.from("cinema_shots").update(edits).eq("id", shot.id)
      .eq("user_id", user).eq("version", expected).select("*").maybeSingle();
    return error ? json({ error: "Could not save plan" }, 503)
      : !data ? json({ error: "Plan changed elsewhere. Reload before saving." }, 409) : json({ shot: data });
  }
  if (action === "take.attach") {
    const shot = await ownedShot(db, user, body.shot_id);
    if (!shot) return json({ error: "Plan not found" }, 404);
    const run = await ownedRun(db, user, body.run_id);
    if (!run || run.template_version !== "minimax-h3@1" || !["queued","running","done"].includes(run.status))
      return json({ error: "This H3 run is missing, deleted or not attachable" }, 404);
    const { data: existing } = await db.from("cinema_takes").select("*").eq("shot_id", shot.id)
      .eq("user_id", user).eq("run_id", run.id).maybeSingle();
    if (existing) return json({ take: existing });
    if (run.status === "done") {
      const { data: asset } = await db.from("comfy_assets").select("id").eq("run_id", run.id)
        .eq("owner_id", user).eq("role", "final").eq("mime", "video/mp4").is("withdrawn_at", null).maybeSingle();
      if (!asset) return json({ error: "Finished run has no private video file" }, 409);
    }
    const { data, error } = await db.from("cinema_takes").insert({
      user_id: user, project_id: shot.project_id, shot_id: shot.id, run_id: run.id,
    }).select("*").single();
    return error || !data ? json({ error: "Could not attach take. Refresh to check if it was already added." }, 409) : json({ take: data }, 201);
  }
  if (action === "take.select") {
    const shot = await ownedShot(db, user, body.shot_id);
    if (!shot) return json({ error: "Plan not found" }, 404);
    if (!isId(body.take_id)) return json({ error: "Invalid take" }, 400);
    const expected = body.version;
    if (!Number.isSafeInteger(expected) || expected !== shot.version) return json({ error: "Selection changed elsewhere. Reload." }, 409);
    const { data: take } = await db.from("cinema_takes").select("id,run_id").eq("id", body.take_id)
      .eq("shot_id", shot.id).eq("user_id", user).maybeSingle();
    if (!take) return json({ error: "Take not found for this plan" }, 404);
    const run = await ownedRun(db, user, take.run_id);
    if (!run || run.status !== "done") return json({ error: "Select a completed take" }, 409);
    const { data: asset } = await db.from("comfy_assets").select("id").eq("run_id", run.id)
      .eq("owner_id", user).eq("role", "final").eq("mime", "video/mp4").is("withdrawn_at", null).maybeSingle();
    if (!asset) return json({ error: "Take video unavailable" }, 409);
    const { data, error } = await db.from("cinema_shots").update({
      selected_take_id: take.id, version: shot.version + 1, updated_at: new Date().toISOString(),
    }).eq("id", shot.id).eq("user_id", user).eq("version", expected).select("*").maybeSingle();
    return error ? json({ error: "Selection could not be saved" }, 503)
      : !data ? json({ error: "Selection changed elsewhere. Reload." }, 409) : json({ shot: data });
  }
  if (action === "shot.preview") {
    const shot = await ownedShot(db, user, body.shot_id);
    if (!shot) return json({ error: "Plan not found" }, 404);
    const project = await ownedProject(db, user, shot.project_id);
    if (!project) return json({ error: "Project not found" }, 404);
    const model = STUDIO_MODELS.find(m => m.slug === "minimax-h3");
    if (!model) return json({ error: "H3 is not available in this Studio." }, 503);
    const { data: rows, error: elementsError } = await db.from("cinema_elements").select("*")
      .eq("project_id", project.id).eq("user_id", user);
    if (elementsError) return json({ error: "References unavailable" }, 503);
    const elements: Element[] = (rows ?? []).map(e => ({
      id: String(e.id), kind: e.kind as Element["kind"], name: String(e.name),
      description: String(e.description ?? ""), refPaths: e.reference_path ? [String(e.reference_path)] : [],
    }));
    const castIds: string[] = [];
    if (shot.first_frame_path) {
      if (!usableReferencePath(user, shot.first_frame_path) || !String(shot.first_frame_path).startsWith(user + "/library/"))
        return json({ error: "Invalid saved reference" }, 400);
      const signed = await db.storage.from("references").createSignedUrl(shot.first_frame_path, 60);
      if (signed.error || !signed.data?.signedUrl) return json({ error: "Reference no longer available" }, 409);
      elements.unshift({ id: "selected-first-frame", kind: "character", name: "Subject in first frame",
        description: "", refPaths: [shot.first_frame_path] });
      castIds.push("selected-first-frame");
    }
    let composed;
    try {
      composed = composeShot({
        userId: user, project: { aspect: project.aspect, look: project.look ?? {} },
        shot: { action: shot.action, size: shot.size, angle: shot.angle, movement: shot.movement,
          lens: shot.lens, focus: shot.focus, lighting: shot.lighting, mood: shot.mood,
          duration: shot.duration, sound: shot.sound, castIds, locationId: null },
        elements, mode: shot.first_frame_path ? "animate" : "text", model,
      });
    } catch (e) { return json({ error: e instanceof Error ? e.message : "Invalid plan" }, 400); }
    return json({ preview: { prompt: composed.prompt, params: toRunParams(model, composed),
      notes: composed.notes, warnings: composed.warnings, framing_warning: composed.framingWarning } });
  }
  return json({ error: "Unknown Cinema action" }, 400);
}
