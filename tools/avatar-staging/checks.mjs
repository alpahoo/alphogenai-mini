// API checks for the hosted staging rehearsal. Pure functions over a context, so they can also be exercised against the LOCAL stack.
//
// ctx = {
//   base:  (path) => string            absolute URL of the Preview (or local dev server)
//   req:   (who, method, path, {json, form, headers}) => Promise<{status, json, text}>   who: "admin" | "user" | "anon"
//   db:    supabase-js service client of the project under test (used ONLY to read counters and to clean up)
//   ids:   { admin, user }             disposable account ids
//   state: { gateBefore }              filled by the caller
//   media: directory with good.wav / long.mp3 / portrait.png
// }
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recorder, sleep } from "../avatar-local/lib.mjs";

const uploadForm = (file, name, type) => { const f = new FormData(); f.append("file", new File([readFileSync(file)], path.basename(file), { type })); f.append("name", name); return f; };
const tag = () => " " + Date.now().toString(36).slice(-4);

async function waitTerminal(ctx, id, timeoutMs) {
  const t0 = Date.now(); let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = (await ctx.req("admin", "GET", `/api/admin/comfy/runs/${id}`)).json;
    if (last?.run && !["queued", "running"].includes(last.run.status)) return last;
    await sleep(4000);
  }
  return last;
}

/** LongCat avatar (#125). The GPU is the simulated broker path of the Modal staging app: no GPU is used. */
export async function checksLongcat(ctx) {
  const r = recorder("LongCat avatar #125: hosted flow, simulated GPU (API checks)");
  const T = tag();
  r.check("anonymous: readiness refused (401)", (await ctx.req("anon", "GET", "/api/admin/comfy/runs?template=longcat-avatar")).status === 401);
  const ready = await ctx.req("admin", "GET", "/api/admin/comfy/runs?template=longcat-avatar");
  r.check("admin: gate open, H100 executor, 0.75 reservation", ready.json?.ready === true && ready.json?.cost?.gpu === "H100" && ready.json?.cost?.reservation_usd === 0.75, JSON.stringify(ready.json?.reason ?? ready.json?.blockers));
  r.check("non-admin: refused (403) on readiness, audio library and runs",
    (await ctx.req("user", "GET", "/api/admin/comfy/runs?template=longcat-avatar")).status === 403 &&
    (await ctx.req("user", "GET", "/api/admin/studio/audio")).status === 403 &&
    (await ctx.req("user", "POST", "/api/admin/comfy/runs", { json: { template: "longcat-avatar", params: {}, idempotency_key: randomUUID() } })).status === 403);

  const goodWav = path.join(ctx.media, "good.wav"), longMp3 = path.join(ctx.media, "long.mp3"), png = path.join(ctx.media, "portrait.png");
  const up = await ctx.req("admin", "POST", "/api/admin/studio/audio", { form: uploadForm(goodWav, "Hosted 9s" + T, "audio/wav") });
  r.check("audio upload (9.72 s WAV) accepted", up.status === 201, String(up.status));
  r.check("audio upload: 12 s MP3 accepted by the API (duration is checked by the broker)", (await ctx.req("admin", "POST", "/api/admin/studio/audio", { form: uploadForm(longMp3, "Hosted long" + T, "audio/mpeg") })).status === 201);
  const portrait = await ctx.req("admin", "POST", "/api/admin/studio/references", { form: uploadForm(png, "Hosted portrait" + T, "image/png") });
  r.check("portrait upload through the existing library (201)", portrait.status === 201);
  const audioPath = up.json?.item?.path, image = portrait.json?.item?.path;
  const longPath = ((await ctx.req("admin", "GET", "/api/admin/studio/audio")).json?.items ?? []).find((a) => a.name === "Hosted long" + T)?.path;
  r.check("the non-admin sees nothing of it", (await ctx.req("user", "GET", "/api/admin/studio/audio")).status === 403);
  if (!audioPath || !image) { r.check("inputs available for the render", false, "upload failed"); return r; }

  const post = (params, key = randomUUID(), who = "admin") => ctx.req(who, "POST", "/api/admin/comfy/runs", { json: { template: "longcat-avatar", params, idempotency_key: key } });
  r.check("path traversal refused (400)", (await post({ image_path: image.replace("/library/", "/library/../"), audio_path: audioPath })).status === 400);
  r.check("locked parameter refused (400)", (await post({ image_path: image, audio_path: audioPath, steps: 50 })).status === 400);
  r.check("a missing audio file reserves nothing (400)", (await post({ image_path: image, audio_path: audioPath.replace(".wav", "x.wav") })).status === 400);

  const params = { image_path: image, audio_path: audioPath, seed: 7 };
  const first = await post(params);
  r.check("render accepted (202)", first.status === 202, JSON.stringify(first.json));
  const runId = first.json?.run_id;
  if (!runId) return r;
  r.check("DUPLICATE: same inputs, new key -> the SAME run", (await post(params)).json?.run_id === runId);
  const k = randomUUID(); const a = await post(params, k), b = await post(params, k);
  r.check("DUPLICATE: same key twice -> the same run", a.json?.run_id === runId && b.json?.run_id === runId);
  r.check("a different request while one is active is refused (409)", (await post({ ...params, seed: 8 })).status === 409);
  r.check("audio of an ACTIVE render cannot be deleted (409)", up.json?.item?.id ? (await ctx.req("admin", "DELETE", `/api/admin/studio/audio?id=${up.json.item.id}`)).status === 409 : false);
  r.check("another account cannot read the run", [403, 404].includes((await ctx.req("user", "GET", `/api/admin/comfy/runs/${runId}`)).status));

  const done = await waitTerminal(ctx, runId, 12 * 60_000);
  r.check("the render completes (done)", done?.run?.status === "done", `${done?.run?.status} ${done?.run?.error_code ?? ""}`);
  r.check("exactly one `final` MP4 asset", done?.assets?.length === 1 && done.assets[0].role === "final" && done.assets[0].mime === "video/mp4", JSON.stringify(done?.assets));
  if (done?.assets?.[0]) {
    const media = (await ctx.req("admin", "GET", `/api/admin/comfy/media/${done.assets[0].id}?download=1`)).json;
    r.check("private signed link with a download name", !!media?.url && /download=/.test(media.url));
    const buf = Buffer.from(await (await fetch(media.url)).arrayBuffer());
    r.check("the MP4 downloads and starts with an `ftyp` box (size > 20 kB)", buf.length > 20_000 && buf.subarray(4, 8).toString() === "ftyp", `${buf.length} bytes`);
    ctx.mp4 = buf;
    r.check("another account cannot sign the video", [403, 404].includes((await ctx.req("user", "GET", `/api/admin/comfy/media/${done.assets[0].id}`)).status));
  }
  const gate = (await ctx.db.from("comfy_runtime_gates").select("remaining_runs,committed_usd").eq("runtime", "longcat-avatar@1").single()).data;
  r.check("exactly one reservation for the double-clicked render (4/0.75 left)", gate?.remaining_runs === 4 && Number(gate?.committed_usd) === 0.75, JSON.stringify(gate));
  const hist = (await ctx.req("admin", "GET", "/api/admin/comfy/history?limit=20")).json;
  r.check("the library lists the render with its video", hist?.items?.some((i) => i.id === runId && i.assets?.length === 1));

  if (longPath) {
    const lr = await post({ image_path: image, audio_path: longPath, seed: 11 });
    const ld = lr.json?.run_id ? await waitTerminal(ctx, lr.json.run_id, 8 * 60_000) : null;
    r.check("a 12 s audio is refused by the broker BEFORE any GPU (AUDIO_TOO_LONG)", ld?.run?.status === "failed" && ld.run.error_code === "AUDIO_TOO_LONG", `${ld?.run?.status} ${ld?.run?.error_code ?? ""}`);
  }
  // Deleting a finished render (the [deleted] redaction shared with #119): ownership, content gone, accounting kept.
  const jobId = (await ctx.db.from("comfy_runs").select("job_id").eq("id", runId).single()).data?.job_id;
  const assetIds = (done?.assets ?? []).map((a) => a.id);
  const before = (await ctx.db.from("comfy_runtime_gates").select("remaining_runs,committed_usd").eq("runtime", "longcat-avatar@1").single()).data;
  r.check("another account cannot delete the render (404)", [403, 404].includes((await ctx.req("user", "DELETE", `/api/admin/comfy/runs/${runId}`)).status));
  const del = await ctx.req("admin", "DELETE", `/api/admin/comfy/runs/${runId}`);
  r.check("DELETE a finished render answers 200 (no 503)", del.status === 200, `${del.status} ${del.json?.error ?? ""}`);
  const jobRow = (await ctx.db.from("jobs").select("prompt").eq("id", jobId).maybeSingle()).data;
  r.check("the job row stays with the redaction marker instead of the prompt", jobRow?.prompt === "[deleted]", String(jobRow?.prompt).slice(0, 20));
  const left = (await ctx.db.from("comfy_assets").select("id").eq("run_id", runId)).data?.length ?? 0;
  const graph = (await ctx.db.from("comfy_run_graphs").select("run_id").eq("run_id", runId)).data?.length ?? 0;
  r.check("the asset records and the stored graph are gone", left === 0 && graph === 0, `assets=${left} graphs=${graph}`);
  r.check("the run is hidden (GET 404) and absent from the library", (await ctx.req("admin", "GET", `/api/admin/comfy/runs/${runId}`)).status === 404 && !(await ctx.req("admin", "GET", "/api/admin/comfy/history?limit=20")).json?.items?.some((i) => i.id === runId));
  r.check("the signed link of the deleted video no longer works", assetIds.length ? [403, 404].includes((await ctx.req("admin", "GET", `/api/admin/comfy/media/${assetIds[0]}`)).status) : false);
  const after = (await ctx.db.from("comfy_runtime_gates").select("remaining_runs,committed_usd").eq("runtime", "longcat-avatar@1").single()).data;
  r.check("deleting gives nothing back: the reservation and the run count are unchanged", JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ before, after }));
  r.check("deleting twice is refused (404), never a second deletion", (await ctx.req("admin", "DELETE", `/api/admin/comfy/runs/${runId}`)).status === 404);
  return r;
}

/** Cinema M1 (#119): guards, isolation from the existing recipe data, a create/read round trip. */
export async function checksCinema(ctx) {
  const r = recorder("Cinema #119: hosted API checks (no generation)");
  const url = "/api/admin/studio/cinema";
  r.check("anonymous: refused (401)", (await ctx.req("anon", "GET", url)).status === 401);
  r.check("non-admin: refused (403) on GET and POST", (await ctx.req("user", "GET", url)).status === 403 && (await ctx.req("user", "POST", url, { json: { action: "project.create", title: "x" } })).status === 403);
  const list = await ctx.req("admin", "GET", url);
  const items = list.json?.projects;
  r.check("admin: list answers 200", list.status === 200, String(list.status));
  r.check("isolation: the disposable admin does not see the projects of the existing recipe accounts", Array.isArray(items) && items.length === 0, `${Array.isArray(items) ? items.length : "n/a"} item(s)`);
  const p = await ctx.req("admin", "POST", url, { json: { action: "project.create", title: "avatar-rehearsal project" } });
  r.check("project.create works (201)", p.status === 201, String(p.status));
  const pid = p.json?.project?.id;
  if (pid) {
    const s = await ctx.req("admin", "POST", url, { json: { action: "scene.create", project_id: pid, title: "Scene A" } });
    const sid = s.json?.scene?.id;
    r.check("scene.create works (201)", s.status === 201 && !!sid, String(s.status));
    const sh = sid ? await ctx.req("admin", "POST", url, { json: { action: "shot.create", project_id: pid, scene_id: sid, description: "A test shot" } }) : { status: 0 };
    r.check("shot.create works (201)", sh.status === 201, String(sh.status));
    const got = await ctx.req("admin", "GET", `${url}?project=${pid}`);
    r.check("storyboard read back: 1 scene, 1 shot", (got.json?.scenes?.length ?? 0) === 1 && (got.json?.shots?.length ?? 0) === 1, JSON.stringify({ s: got.json?.scenes?.length, h: got.json?.shots?.length }));
    r.check("the non-admin cannot read it", (await ctx.req("user", "GET", `${url}?project=${pid}`)).status === 403);
  }
  return r;
}

/** Parallax modules (#123): public booleans, admin guard, persistence through the new app_settings table. */
export async function checksParallax(ctx) {
  const r = recorder("Parallax #123: hosted API checks (no generation)");
  r.check("anonymous: /api/admin/modules refused (401)", (await ctx.req("anon", "GET", "/api/admin/modules")).status === 401);
  const pub = await ctx.req("anon", "GET", "/api/modules");
  r.check("public /api/modules: booleans only", pub.status === 200 && Object.values(pub.json?.modules ?? {}).every((v) => typeof v === "boolean"), JSON.stringify(pub.json));
  r.check("non-admin: GET 403 and PATCH 403", (await ctx.req("user", "GET", "/api/admin/modules")).status === 403 &&
    (await ctx.req("user", "PATCH", "/api/admin/modules", { json: { module: "parallax_audio", enabled: true } })).status === 403);
  const before = await ctx.req("admin", "GET", "/api/admin/modules");
  r.check("admin: GET 200 with the five modules", before.status === 200 && Object.keys(before.json?.modules ?? {}).length === 5, String(before.status));
  r.check("Shorts disabled -> 404 even for a signed-in admin (guard before any job)", (await ctx.req("admin", "POST", "/api/parallax/shorts", { json: { prompt: "A short idea" } })).status === 404);
  const on = await ctx.req("admin", "PATCH", "/api/admin/modules", { json: { module: "parallax_audio", enabled: true } });
  r.check("admin: PATCH saves (app_settings exists and is writable)", on.status === 200 && on.json?.modules?.parallax_audio === true, `${on.status} ${on.json?.error ?? ""}`);
  r.check("the public flag reflects it after a reload", (await ctx.req("anon", "GET", "/api/modules")).json?.modules?.parallax_audio === true);
  const off = await ctx.req("admin", "PATCH", "/api/admin/modules", { json: { module: "parallax_audio", enabled: false } });
  r.check("admin: PATCH back to disabled", off.status === 200 && off.json?.modules?.parallax_audio === false);
  r.check("the public flag is back to false", (await ctx.req("anon", "GET", "/api/modules")).json?.modules?.parallax_audio === false);
  r.note("Shorts submission", "not exercised: it forwards to /api/jobs and could start a paid generation; only the disabled guard is checked");
  return r;
}

export const VISUAL_TODO = [
  "Mobile (375 px) and tablet: Talking avatar page (/admin/studio/avatar): portrait grid, audio list with players, status area, video player and download button, no horizontal scroll.",
  "Desktop: choose a portrait and an audio, render, watch the status change, play the MP4, download it, reload the page and find the render in the Library.",
  "Cinema Studio screen (#119): storyboard, takes, montage panel on mobile and desktop.",
  "Parallax screens (#123): /admin/modules switches, navigation entries appearing and disappearing, Shorts / Audio / Remix pages, on mobile and desktop.",
  "Dark and light themes on each of those screens.",
];
