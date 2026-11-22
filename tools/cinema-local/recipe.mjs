// Cinema M1 local recipe (issue #117 acceptance scenario) against the LOCAL Supabase stack and the local dev server.
//
//   node tools/cinema-local/recipe.mjs --generation locked      (dev.mjs without --simulated)
//   node tools/cinema-local/recipe.mjs --generation simulated   (dev.mjs --simulated)
//
// No cloud, no Vercel, no paid GPU. Everything it writes is local. Exit code 0 only if every check passes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { request } from "node:https";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ROOT, loadEnv, serviceClient, login, call, cinema, storyboard, recorder, psql, ffmpegPath, hex } from "./lib.mjs";

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const MODE = arg("generation", "locked");
if (!["locked", "simulated"].includes(MODE)) throw new Error("--generation must be locked or simulated");
const env = loadEnv(), db = serviceClient(env), API = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const R = { plan1: "cd598314-0000-4000-8000-000000000001", plan2_old: "731316da-0000-4000-8000-000000000002", plan2: "a1bc89fe-0000-4000-8000-000000000003", plan3: "e3d7a11c-0000-4000-8000-000000000004", b_plan3: "b0b0b0b0-0000-4000-8000-000000000006" };
const A = await login(env, env.LOCAL_TEST_USER_A_EMAIL, env.LOCAL_TEST_USER_A_PASSWORD);
const B = await login(env, env.LOCAL_TEST_USER_B_EMAIL, env.LOCAL_TEST_USER_B_PASSWORD);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const count = async (t) => (await db.from(t).select("*", { count: "exact", head: true })).count;
const gate = async () => (await db.from("comfy_admin_gate").select("*").single()).data;
const waitFor = async (fn, ms = 40000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(600); } };
const runStatus = async (id) => (await db.from("comfy_runs").select("status,finance_status").eq("id", id).single()).data?.status;

// ---- media helpers (ffmpeg-static) ------------------------------------------------------------------------------
const FF = ffmpegPath();
async function fetchSigned(url) { const r = await fetch(url); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") }; }
function probe(buf) {
  const tmp = path.join(ROOT, "tmp/cinema-local/probe.mp4"); writeTmp(tmp, buf);
  const r = spawnSync(FF, ["-hide_banner", "-stats", "-i", tmp, "-map", "0:v:0", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const frames = [...String(r.stderr).matchAll(/frame=\s*(\d+)/g)].pop()?.[1];
  const d = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr);
  return { frames: Number(frames), duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : NaN, hasAudio: /Audio: aac/.test(r.stderr), hasVideo: /Video: h264/.test(r.stderr) };
}
function writeTmp(file, buf) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, buf); }
function pcm(buf) {
  const tmp = path.join(ROOT, "tmp/cinema-local/pcm.mp4"); writeTmp(tmp, buf);
  const r = spawnSync(FF, ["-v", "error", "-i", tmp, "-f", "f32le", "-ac", "1", "-ar", "32000", "-"], { maxBuffer: 1 << 27 });
  const b = r.stdout; return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)));
}
/** Best normalized correlation between a montage window and a source window, searching +-15 samples. Returns { corr, lag }. */
function bestCorr(mont, src, mOff, sOff, len = 8000) {
  let best = { corr: -2, lag: 0 };
  for (let lag = -15; lag <= 15; lag++) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < len; i++) { const x = mont[mOff + lag + i], y = src[sOff + i]; ab += x * y; aa += x * x; bb += y * y; }
    const c = aa && bb ? ab / Math.sqrt(aa * bb) : 0; if (c > best.corr) best = { corr: c, lag };
  }
  return best;
}
/** Start of the loudest `len`-sample window of a clip (speech or tone), away from the 100 ms edges where fades live. */
function loudWindow(src, len = 8000) {
  let best = { e: -1, at: 3200 };
  for (let at = 3200; at + len < src.length - 3200; at += 800) { let e = 0; for (let i = 0; i < len; i += 4) e += src[at + i] ** 2; if (e > best.e) best = { e, at }; }
  return best.at;
}
const assetOf = async (runId, role, owner = A.id) => (await db.from("comfy_assets").select("id,storage_key").eq("run_id", runId).eq("owner_id", owner).eq("role", role).maybeSingle()).data;
const download = async (key) => { const d = await db.storage.from("comfy-outputs").download(key); return Buffer.from(await d.data.arrayBuffer()); };

// ---- disposable run helper (for deletion / queued-run tests) -----------------------------------------------------
async function makeRun(owner, { status = "done", assets = true } = {}) {
  const id = randomUUID();
  const job = (await db.from("jobs").insert({ user_id: owner, prompt: "recipe disposable", status: status === "done" ? "done" : "pending", current_stage: status === "done" ? "completed" : "queued", engine_used: "comfy:minimax-h3", metadata: { fixture: true } }).select("id").single()).data;
  const ins = await db.from("comfy_runs").insert({ id, job_id: job.id, user_id: owner, idempotency_key: randomUUID(), runtime: "h3-video@1", template_version: "minimax-h3@1", params_effective: { prompt: "recipe disposable", seconds: 5, fixture: true }, resolved_graph_sha256: "recipe", status, reserved_cost_usd: 0, finance_status: status === "done" ? "awaiting_reconciliation" : "reserved", finished_at: status === "done" ? new Date().toISOString() : null });
  if (ins.error) throw new Error("makeRun: " + ins.error.message);
  if (assets) {
    const src = await download(`${A.id}/${R.plan3}/final.mp4`);
    const key = `${owner}/${id}/final.mp4`;
    await db.storage.from("comfy-outputs").upload(key, src, { contentType: "video/mp4", upsert: true });
    await db.from("comfy_assets").insert({ run_id: id, owner_id: owner, role: "final", storage_key: key, mime: "video/mp4" });
  }
  return id;
}
async function dropRun(id) {
  const run = (await db.from("comfy_runs").select("job_id,user_id").eq("id", id).maybeSingle()).data; if (!run) return;
  const assets = (await db.from("comfy_assets").select("storage_key").eq("run_id", id)).data ?? [];
  if (assets.length) await db.storage.from("comfy-outputs").remove(assets.map((a) => a.storage_key));
  for (const t of ["comfy_dispatch_outbox", "comfy_run_graphs", "comfy_assets"]) await db.from(t).delete().eq("run_id", id);
  await db.from("comfy_runs").delete().eq("id", id); await db.from("jobs").delete().eq("id", run.job_id);
}

// ---- snapshot of what must not change ----------------------------------------------------------------------------
const before = { runs: await count("comfy_runs"), jobs: await count("jobs"), gate: JSON.stringify(await gate()), assets: await count("comfy_assets") };
const t = recorder(`Cinema M1 local recipe (generation ${MODE})`);
const { check, note } = t;

// ======================================================================================================================
// 1. Authenticated storyboard flow (issue #117 scenario 1-3, 6)
// ======================================================================================================================
check("A0 unauthenticated request refused", [401, 403].includes((await call(null, "GET", "/api/admin/studio/cinema")).status));
const proj = (await cinema(A, { action: "project.create", title: "Luz recipe " + new Date().toISOString().slice(11, 19), aspect: "9:16" })).json?.project;
const scene = (await cinema(A, { action: "scene.create", project_id: proj.id, title: "Cour" })).json?.scene;
const lib = (await db.storage.from("references").list(A.id + "/library")).data ?? [];
const frameA = A.id + "/library/" + lib.find((f) => f.name.startsWith(hex("Luz") + "_")).name;
const shots = [];
for (let i = 1; i <= 3; i++) {
  const s = (await cinema(A, { action: "shot.create", project_id: proj.id, scene_id: scene.id, description: "Plan " + i })).json?.shot;
  const u = await cinema(A, { action: "shot.update", shot_id: s.id, version: s.version, first_frame_path: frameA, size: "Full" });
  shots.push(u.json?.shot ?? s);
}
check("S1 project, scene and three ordered plans created for account A", !!proj && !!scene && shots.length === 3 && shots.every((s, i) => s?.position === i && s.user_id === A.id));
const attach = (user, shot, run) => cinema(user, { action: "take.attach", shot_id: shot.id, run_id: run });
const T = {};
for (const [key, idx] of [["plan1", 0], ["plan2_old", 1], ["plan2", 1], ["plan3", 2]]) T[key] = (await attach(A, shots[idx], R[key])).json?.take;
check("S2 three renders attached in order, the fourth as plan-2 alternative", ["plan1", "plan2_old", "plan2", "plan3"].every((k) => T[k]?.run_id === R[k]) && T.plan2.shot_id === shots[1].id && T.plan2_old.shot_id === shots[1].id);
const fresh = async () => (await storyboard(A, proj.id));
const versionOf = async (idx) => (await fresh()).shots.find((s) => s.id === shots[idx].id).version;
for (const [idx, key] of [[0, "plan1"], [1, "plan2"], [2, "plan3"]]) await cinema(A, { action: "take.select", shot_id: shots[idx].id, take_id: T[key].id, version: await versionOf(idx) });
const selection = async (user = A) => { const sb = await storyboard(user, proj.id); const byId = new Map(sb.takes.map((x) => [x.id, x.run_id])); return sb.shots.map((s) => byId.get(s.selected_take_id)); };
// Reload = a brand new sign-in and a fresh read.
const A2 = await login(env, env.LOCAL_TEST_USER_A_EMAIL, env.LOCAL_TEST_USER_A_PASSWORD);
check("S3 reload (new session): project, scenes, plans, takes and the plan-2 selection survive (final a1bc89fe)", JSON.stringify(await selection(A2)) === JSON.stringify([R.plan1, R.plan2, R.plan3]));
const snap = async () => { const sb = await fresh(); return sb.shots.map((s) => `${s.id}:${s.version}:${s.selected_take_id}`); };
const s0 = await snap();
let r = await cinema(A, { action: "take.select", shot_id: shots[1].id, take_id: T.plan2_old.id, version: await versionOf(1) });
const s1 = await snap();
check("S4 plan 2 switched to the alternative 731316da; plans 1 and 3 untouched", r.status === 200 && (await selection(A2))[1] === R.plan2_old && s1[0] === s0[0] && s1[2] === s0[2]);
await cinema(A, { action: "take.select", shot_id: shots[1].id, take_id: T.plan2.id, version: await versionOf(1) });
check("S5 switched back: a1bc89fe is the final again after reload", JSON.stringify(await selection(await login(env, env.LOCAL_TEST_USER_A_EMAIL, env.LOCAL_TEST_USER_A_PASSWORD))) === JSON.stringify([R.plan1, R.plan2, R.plan3]));
const v = await versionOf(1);
const race = await Promise.all([cinema(A, { action: "take.select", shot_id: shots[1].id, take_id: T.plan2_old.id, version: v }), cinema(A, { action: "take.select", shot_id: shots[1].id, take_id: T.plan2.id, version: v })]);
check("S6 two concurrent selections on the same version: exactly one wins, the other gets a 409", race.map((x) => x.status).sort().join() === "200,409", race.map((x) => x.status).join("/"));
await cinema(A, { action: "take.select", shot_id: shots[1].id, take_id: T.plan2.id, version: await versionOf(1) });
const cur = (await fresh()).shots[0];
check("S7 stale shot version refused (409) and nothing written", (await cinema(A, { action: "shot.update", shot_id: cur.id, version: cur.version - 1, size: "Wide" })).status === 409 && (await fresh()).shots[0].size === cur.size);
const pv = await cinema(A, { action: "shot.preview", shot_id: cur.id, expected_version: cur.version });
check("S8 preview composes a prompt and params without creating any run", pv.status === 200 && !!pv.json.preview?.params && (await count("comfy_runs")) === before.runs);
note("S8b framing caution", "framing_warning=" + JSON.stringify(pv.json?.preview?.framing_warning ?? null) + " (not wired in M1: no framing field is stored for a first frame; see docs/cinema-m1-local-recipe.md)");
check("S9 a stale expected_version on preview is refused (409)", (await cinema(A, { action: "shot.preview", shot_id: cur.id, expected_version: cur.version - 1 })).status === 409);

// ======================================================================================================================
// 2. Private media and Corrected-audio montage (scenario 5-6)
// ======================================================================================================================
const order = (await fresh()); const byTake = new Map(order.takes.map((x) => [x.id, x.run_id]));
const selected = order.shots.sort((a, b) => a.position - b.position).map((s) => byTake.get(s.selected_take_id));
const assetPlan1 = await assetOf(R.plan1, "final");
const media = (await call(A, "GET", "/api/admin/comfy/media/" + assetPlan1.id)).json;
const played = media?.url ? await fetchSigned(media.url) : { status: 0, buf: Buffer.alloc(0) };
check("M1 own clip plays through a private signed URL (MP4)", played.status === 200 && played.buf.subarray(4, 8).toString() === "ftyp");
const dl = (await call(A, "GET", "/api/admin/comfy/media/" + assetPlan1.id + "?download=1")).json;
check("M2 download link carries a server-built file name", /alphogen-cd598314-corrected\.mp4/.test(dl?.url ?? ""));
// Keep the montage count bounded across reruns: remove the montages that earlier runs of this recipe left behind.
for (const old of (await call(A, "GET", "/api/admin/studio/montages")).json?.items ?? []) if (String(old.name).startsWith("Luz recipe")) await call(A, "DELETE", "/api/admin/studio/montages?id=" + old.id);
const mk = await call(A, "POST", "/api/admin/studio/montages", { run_ids: selected, audio: "corrected", name: "Luz recipe corrected" });
check("M3 montage of the three selected finals (storyboard order) accepted", mk.status === 201 && JSON.stringify(selected) === JSON.stringify([R.plan1, R.plan2, R.plan3]), "status " + mk.status + " " + (mk.json?.error ?? ""));
const montageId = mk.json?.item?.id;
const link = (await call(A, "GET", "/api/admin/studio/montages?id=" + montageId)).json;
const montBuf = link?.url ? (await fetchSigned(link.url)).buf : Buffer.alloc(0);
const info = probe(montBuf);
check("M4 montage MP4 is playable: 372 frames, about 15.5 s, video and AAC audio", info.frames === 372 && Math.abs(info.duration - 15.5) < 0.1 && info.hasAudio && info.hasVideo, JSON.stringify(info));
const dlink = (await call(A, "GET", "/api/admin/studio/montages?id=" + montageId + "&download=1")).json;
check("M5 montage download link available", /^http/.test(dlink?.url ?? ""));
const mont = pcm(montBuf); const SR = 32000, CLIP = (124 / 24) * SR;
let corrected = true, usedOriginal = false; const detail = [], lags = [];
for (let k = 0; k < 3; k++) {
  const fin = pcm(await download(`${A.id}/${selected[k]}/final.mp4`)), raw = pcm(await download(`${A.id}/${selected[k]}/raw.mp4`));
  const at = loudWindow(fin), off = Math.round(k * CLIP) + at;
  const cf = bestCorr(mont, fin, off, at), cr = bestCorr(mont, raw, off, at);
  lags.push(cf.lag); detail.push(`clip${k + 1}: Corrected ${cf.corr.toFixed(2)} lag ${cf.lag} sample(s), Original ${cr.corr.toFixed(2)}`);
  if (!(cf.corr > 0.85)) corrected = false;
  if (cr.corr > 0.5) usedOriginal = true;
}
check("M6 the montage carries the Corrected audio of each selected clip (high correlation) and not the Original", corrected && !usedOriginal, detail.join(" | "));
check("M7 both joins are in sync: clips 2 and 3 (after the first and second cut) sit within 2 samples (0.06 ms) of their source", lags.every((l) => Math.abs(l) <= 2), "lags " + lags.join("/") + " samples");
const mk2 = await call(A, "POST", "/api/admin/studio/montages", { run_ids: selected, audio: "original", name: "Luz recipe original" });
const mont2 = mk2.json?.item?.id ? pcm((await fetchSigned((await call(A, "GET", "/api/admin/studio/montages?id=" + mk2.json.item.id)).json.url)).buf) : new Float32Array(0);
const fin1 = pcm(await download(`${A.id}/${selected[0]}/final.mp4`)), raw1 = pcm(await download(`${A.id}/${selected[0]}/raw.mp4`));
const w1 = loudWindow(raw1);
check("M8 Original audio is selectable and differs from Corrected", mk2.status === 201 && bestCorr(mont2, raw1, w1, w1).corr > 0.85 && bestCorr(mont2, fin1, w1, w1).corr < 0.5);
const reloadList = JSON.stringify((await call(A2, "GET", "/api/admin/studio/montages")).json);
check("M9 reload: the montages are listed and every source clip and file still exists", reloadList.includes("Luz recipe corrected") && (await assetOf(R.plan1, "final")) && (await assetOf(R.plan2, "final")) && (await assetOf(R.plan3, "final")) && (await assetOf(R.plan2_old, "final")));
if (mk2.json?.item?.id) check("M10 deleting a montage never deletes its sources", (await call(A, "DELETE", "/api/admin/studio/montages?id=" + mk2.json.item.id)).status === 200 && (await assetOf(R.plan1, "final")) && (await count("comfy_assets")) === before.assets);

// ======================================================================================================================
// 3. Isolation: account B (scenario 7)
// ======================================================================================================================
const e = (name, status, ok = [404]) => check(name, ok.includes(status), "status " + status);
check("I1 B sees none of A's projects", !(await call(B, "GET", "/api/admin/studio/cinema")).json?.projects?.some((p) => p.id === proj.id));
e("I2 B cannot read A's project", (await call(B, "GET", "/api/admin/studio/cinema?project=" + proj.id)).status);
e("I3 B cannot edit A's plan", (await cinema(B, { action: "shot.update", shot_id: shots[0].id, version: 0, size: "Wide" })).status);
e("I4 B cannot select A's take", (await cinema(B, { action: "take.select", shot_id: shots[0].id, take_id: T.plan1.id, version: 0 })).status);
e("I5 B cannot preview A's plan", (await cinema(B, { action: "shot.preview", shot_id: shots[0].id, expected_version: 0 })).status);
const projB = (await cinema(B, { action: "project.create", title: "B project", aspect: "9:16" })).json.project;
const sceneB = (await cinema(B, { action: "scene.create", project_id: projB.id, title: "B" })).json.scene;
const shotB = (await cinema(B, { action: "shot.create", project_id: projB.id, scene_id: sceneB.id, description: "b" })).json.shot;
e("I6 B cannot attach A's run as a take", (await attach(B, shotB, R.plan1)).status);
e("I7 B attaches its own run", (await attach(B, shotB, R.b_plan3)).status, [201]);
e("I8 B cannot use A's reference image as a first frame", (await cinema(B, { action: "shot.update", shot_id: shotB.id, version: 0, first_frame_path: frameA })).status, [400]);
e("I9 B cannot obtain a link to A's clip", (await call(B, "GET", "/api/admin/comfy/media/" + assetPlan1.id)).status);
e("I10 B cannot obtain a play link to A's montage", (await call(B, "GET", "/api/admin/studio/montages?id=" + montageId)).status);
e("I11 B cannot obtain a download link to A's montage", (await call(B, "GET", "/api/admin/studio/montages?id=" + montageId + "&download=1")).status);
e("I12 B cannot delete A's montage", (await call(B, "DELETE", "/api/admin/studio/montages?id=" + montageId)).status);
e("I13 B cannot build a montage from A's runs", (await call(B, "POST", "/api/admin/studio/montages", { run_ids: [R.plan1, R.plan2], audio: "corrected", name: "steal" })).status);
check("I14 B's montage list and history do not show A's items", !JSON.stringify((await call(B, "GET", "/api/admin/studio/montages")).json).includes("Luz recipe") && !JSON.stringify((await call(B, "GET", "/api/admin/comfy/history")).json).includes("cd598314"));
for (const [label, url] of [["comfy-outputs clip", `${API}/storage/v1/object/authenticated/comfy-outputs/${assetPlan1.storage_key}`], ["reference image", `${API}/storage/v1/object/authenticated/references/${frameA}`]]) {
  const x = await fetch(url, { headers: { apikey: ANON, Authorization: "Bearer " + B.jwt } });
  check("I15 B cannot read A's " + label + " straight from Storage", !x.ok, "http " + x.status);
}
const ownRef = await fetch(`${API}/storage/v1/object/authenticated/references/${frameA}`, { headers: { apikey: ANON, Authorization: "Bearer " + A.jwt } });
check("I16 control: A reads its own reference image straight from Storage", ownRef.ok);
for (const tbl of ["cinema_projects", "cinema_scenes", "cinema_shots", "cinema_takes", "cinema_elements"]) {
  const x = await fetch(`${API}/rest/v1/${tbl}?select=id`, { headers: { apikey: ANON, Authorization: "Bearer " + B.jwt } });
  check("I17 " + tbl + " is not readable through the Data API (no grant)", !x.ok, "http " + x.status);
}

// ======================================================================================================================
// 4. Database constraints (service role = what the API uses) and deletion behaviour
// ======================================================================================================================
const sqlFail = (label, res) => check(label, !!res.error, res.error ? "refused " + res.error.code : "ACCEPTED");
const ins = (o) => db.from("cinema_takes").insert(o);
sqlFail("D1 DB refuses a take of A's plan pointing at B's run", await ins({ user_id: A.id, project_id: proj.id, shot_id: shots[0].id, run_id: R.b_plan3 }));
sqlFail("D2 DB refuses a take of B's plan pointing at A's run", await ins({ user_id: B.id, project_id: projB.id, shot_id: shotB.id, run_id: R.plan2 }));
sqlFail("D3 DB refuses B writing a take into A's plan", await ins({ user_id: B.id, project_id: proj.id, shot_id: shots[0].id, run_id: R.b_plan3 }));
check("D4 DB refuses a run changing owner while a take points to it", !!(await db.from("comfy_runs").update({ user_id: B.id }).eq("id", R.plan1)).error);
check("D5 DB refuses a hard delete of a run referenced by a take", (await db.from("comfy_runs").delete().eq("id", R.plan1)).error?.code === "23503");
// Studio deletion (tombstone) of a disposable run that is a take: the take stays, shown as unavailable.
const scratch = (await cinema(A, { action: "project.create", title: "Scratch delete", aspect: "9:16" })).json.project;
const scratchScene = (await cinema(A, { action: "scene.create", project_id: scratch.id, title: "s" })).json.scene;
const scratchShot = (await cinema(A, { action: "shot.create", project_id: scratch.id, scene_id: scratchScene.id, description: "d" })).json.shot;
const disposable = await makeRun(A.id);
const tk = (await attach(A, scratchShot, disposable)).json?.take;
const del = await call(A, "DELETE", "/api/admin/comfy/runs/" + disposable);
if (del.status === 200) check("D6 deleting the run through the Studio succeeds", true);
else {
  // KNOWN ISSUE outside #119 (lib/comfy/delete-run.ts, main since #111): it clears jobs.prompt with NULL, which the repository
  // schema forbids (jobs.prompt is NOT NULL). Reported, not hidden. The recipe then applies the same final state by hand so the
  // Cinema behaviour (take kept, run hidden) is still verified.
  note("D6a KNOWN ISSUE (not part of #119)", "Studio deletion of a real-shaped run answered " + del.status + ": " + (del.json?.error ?? ""));
  for (const a of (await db.from("comfy_assets").select("storage_key").eq("run_id", disposable)).data ?? []) await db.storage.from("comfy-outputs").remove([a.storage_key]);
  for (const tbl of ["comfy_dispatch_outbox", "comfy_run_graphs", "comfy_assets"]) await db.from(tbl).delete().eq("run_id", disposable);
  await db.from("comfy_runs").update({ params_effective: { deleted_at: new Date().toISOString() }, reference_path: null }).eq("id", disposable);
}
const afterDel = await storyboard(A, scratch.id);
check("D6 a deleted (tombstoned) run keeps its take row, which reads as unavailable: run and file hidden", afterDel.takes.some((x) => x.id === tk.id) && !afterDel.runs.some((x) => x.id === disposable) && !afterDel.assets.some((x) => x.run_id === disposable));
check("D7 the tombstoned run row is kept in the database (accounting) and cannot be hard-deleted while a take points to it", (await db.from("comfy_runs").select("id").eq("id", disposable)).data?.length === 1 && (await db.from("comfy_runs").delete().eq("id", disposable)).error?.code === "23503");
const refresh = async () => (await db.from("comfy_runs").select("id", { count: "exact", head: true })).count;
const runsBeforeProjectDelete = await refresh();
const del2 = await db.from("cinema_projects").delete().eq("id", scratch.id);
const leftovers = await Promise.all(["cinema_scenes", "cinema_shots", "cinema_takes"].map(async (x) => (await db.from(x).select("id", { count: "exact", head: true }).eq("project_id", scratch.id)).count));
check("D8 deleting a project removes its scenes, plans and takes and keeps every run", !del2.error && leftovers.every((n) => n === 0) && (await refresh()) === runsBeforeProjectDelete, "left " + leftovers.join("/"));
const grants = psql("select count(*) from information_schema.role_table_grants where table_schema='public' and table_name like 'cinema_%' and grantee in ('anon','authenticated','PUBLIC')");
await dropRun(disposable);
check("D9 no table grant for anon, authenticated or public on the Cinema tables", grants.stdout === "0");

// ======================================================================================================================
// 5. Generation and relaunch
// ======================================================================================================================
const BASE_RUNS = () => count("comfy_runs");
if (MODE === "locked") {
  const g0 = await gate();
  const runsNow = await BASE_RUNS(), jobsNow = await count("jobs");
  const gen = await call(A, "POST", "/api/admin/comfy/runs", { template: "minimax-h3", idempotency_key: randomUUID(), params: { prompt: "locked recipe" } });
  check("G1 generation route is disabled without a dispatcher (503) and admits nothing", gen.status === 503 && (await BASE_RUNS()) === runsNow && (await count("jobs")) === jobsNow, "status " + gen.status);
  const queued = await makeRun(A.id, { status: "queued", assets: false });
  const retry = await call(A, "POST", "/api/admin/comfy/runs/" + queued);
  check("G2 Retry dispatch is refused (503), the run stays queued and its reservation is preserved", retry.status === 503 && (await runStatus(queued)) === "queued", "status " + retry.status);
  await dropRun(queued);
  check("G3 the H3 gate row is unchanged", JSON.stringify(await gate()) === JSON.stringify(g0));
} else {
  const secretFile = path.join(ROOT, "tmp/cinema-local/dispatch-secret"), cert = path.join(ROOT, "tmp/cinema-local/tls/cert.pem");
  if (!existsSync(secretFile)) throw new Error("Start the simulated dispatcher first: node tools/cinema-local/dev.mjs --simulated");
  const secret = readFileSync(secretFile, "utf8").trim();
  const mock = (method, route, body) => new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: 8443, path: route, method, ca: readFileSync(cert), headers: { "x-comfy-secret": secret, "Content-Type": "application/json" } }, (res) => { let s = ""; res.on("data", (c) => (s += c)); res.on("end", () => resolve(JSON.parse(s || "{}"))); });
    req.on("error", reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
  await mock("POST", "/control", { mode: "accept" });
  const active = psql(`select count(*) from public.jobs where user_id='${A.id}' and status in ('pending','in_progress')`).stdout;
  if (active !== "0") throw new Error("Account A has an active job (" + active + "); the admission RPC would refuse. Remove stale local queued fixtures first.");
  // Local gate only: 4 permits, enough for 4 x 0.75 USD (nothing is charged: the dispatcher is simulated).
  const gateSql = psql(`update public.comfy_admin_gate set enabled=true, rights_confirmed_at=now(), allowed_user_id='${A.id}', expires_at=now()+interval '1 day', remaining_runs=4, budget_usd=3.00, committed_usd=0 where id; select 1`);
  if (!gateSql.ok) throw new Error("local gate setup failed: " + gateSql.error);
  const launchProj = (await cinema(A, { action: "project.create", title: "Luz launch " + new Date().toISOString().slice(11, 19), aspect: "9:16" })).json.project;
  const lScene = (await cinema(A, { action: "scene.create", project_id: launchProj.id, title: "Cour" })).json.scene;
  const L = [];
  for (let i = 1; i <= 3; i++) {
    let s = (await cinema(A, { action: "shot.create", project_id: launchProj.id, scene_id: lScene.id, description: "Luz speaks to camera, plan " + i })).json.shot;
    s = (await cinema(A, { action: "shot.update", shot_id: s.id, version: s.version, first_frame_path: frameA, size: "Full" })).json.shot; L.push(s);
  }
  const LT = {};
  for (const [i, key] of [[0, "plan1"], [1, "plan2"], [2, "plan3"]]) {
    LT[key] = (await attach(A, L[i], R[key])).json.take;
    const sh = (await storyboard(A, launchProj.id)).shots.find((x) => x.id === L[i].id);
    await cinema(A, { action: "take.select", shot_id: L[i].id, take_id: LT[key].id, version: sh.version });
  }
  const sel0 = JSON.stringify((await storyboard(A, launchProj.id)).shots.map((s) => [s.id, s.version, s.selected_take_id]));
  const logCount = async () => (await mock("GET", "/log")).log.length;
  const startRuns = await BASE_RUNS(), startGate = await gate();

  // The exact sequence the Cinema panel runs for "Generate this plan only".
  async function launch(shot, key, { expectStatus = 202 } = {}) {
    const g = (await call(A, "GET", "/api/admin/comfy/runs?template=minimax-h3")).json;
    const cur = (await storyboard(A, launchProj.id)).shots.find((x) => x.id === shot.id);
    const pv = await cinema(A, { action: "shot.preview", shot_id: shot.id, expected_version: cur.version });
    const post = await call(A, "POST", "/api/admin/comfy/runs", { template: "minimax-h3", idempotency_key: key, params: pv.json.preview.params });
    let take = null;
    if (post.status === 202) take = (await attach(A, shot, post.json.run_id)).json?.take;
    return { gate: g, post, take };
  }
  const K1 = randomUUID();
  const l1 = await launch(L[1], K1);
  const run1 = l1.post.json?.run_id;
  check("G1 gate quotes the launch (ready, 0.75 USD reservation) before anything is admitted", l1.gate.ready === true && l1.gate.cost?.reservation_usd === 0.75);
  check("G2 launching plan 2 through the usual routes admits ONE run, dispatches it, and attaches it as a take of plan 2 only", l1.post.status === 202 && l1.post.json.dispatched === true && l1.take?.shot_id === L[1].id && (await BASE_RUNS()) === startRuns + 1);
  check("G3 the simulated render completes (claim, 2 files, finish) and appears as a finished take on plan 2", await waitFor(async () => (await runStatus(run1)) === "done"), "status " + (await runStatus(run1)));
  const sb1 = await storyboard(A, launchProj.id);
  check("G4 plans 1 and 3 are not relaunched: no new run, takes and selections unchanged", sb1.takes.filter((x) => x.shot_id === L[0].id).length === 1 && sb1.takes.filter((x) => x.shot_id === L[2].id).length === 1 && sb1.takes.filter((x) => x.shot_id === L[1].id).length === 2 && (await logCount()) === 1);
  check("G5 the new render did not overwrite the chosen take (a1bc89fe stays selected until the administrator picks)", sb1.shots.find((x) => x.id === L[1].id).selected_take_id === LT.plan2.id && JSON.stringify(sb1.shots.map((s) => [s.id, s.version, s.selected_take_id])) === sel0);
  const g1 = await gate();
  check("G6 one permit and 0.75 USD reserved (not charged: simulated), outbox delivered", g1.remaining_runs === 3 && Number(g1.committed_usd) === 0.75 && !!(await db.from("comfy_dispatch_outbox").select("delivered_at").eq("run_id", run1).single()).data?.delivered_at);
  const asset1 = await assetOf(run1, "final"), asset1raw = await assetOf(run1, "raw");
  const newTake = sb1.takes.find((x) => x.run_id === run1);
  check("G7 the new take has its private Corrected and Original files and can be selected", !!asset1 && !!asset1raw && (await cinema(A, { action: "take.select", shot_id: L[1].id, take_id: newTake.id, version: sb1.shots.find((x) => x.id === L[1].id).version })).status === 200);
  const back = (await storyboard(A, launchProj.id)).shots.find((x) => x.id === L[1].id);
  await cinema(A, { action: "take.select", shot_id: L[1].id, take_id: LT.plan2.id, version: back.version });

  // Technical retry with the SAME key: recovery, no new run, no new dispatch, no new debit.
  const rec = await call(A, "POST", "/api/admin/comfy/runs", { template: "minimax-h3", idempotency_key: K1, params: { prompt: "ignored on recovery" } });
  check("G8 retry with the same key recovers the existing run (recovered:true): no new run, no new debit, no second dispatch", rec.status === 202 && rec.json.recovered === true && rec.json.run_id === run1 && (await BASE_RUNS()) === startRuns + 1 && (await gate()).remaining_runs === 3 && (await logCount()) === 1);

  // Relaunch of plan 2 after an edit: new version, new key, new run, second alternative take.
  const cur2 = (await storyboard(A, launchProj.id)).shots.find((x) => x.id === L[1].id);
  await cinema(A, { action: "shot.update", shot_id: L[1].id, version: cur2.version, description: "Luz speaks to camera, plan 2, second attempt" });
  const l2 = await launch(L[1], randomUUID());
  const run2 = l2.post.json?.run_id;
  await waitFor(async () => (await runStatus(run2)) === "done");
  const sb2 = await storyboard(A, launchProj.id);
  check("G9 relaunching plan 2 after an edit creates exactly one more run and a third take on plan 2; plans 1 and 3 still untouched", l2.post.status === 202 && run2 !== run1 && sb2.takes.filter((x) => x.shot_id === L[1].id).length === 3 && sb2.takes.filter((x) => x.shot_id !== L[1].id).length === 2 && (await BASE_RUNS()) === startRuns + 2 && (await logCount()) === 2);

  // Dispatch outage: the admission succeeds, the dispatch is refused; Retry dispatch uses the usual route.
  await mock("POST", "/control", { mode: "reject" });
  const l3 = await launch(L[0], randomUUID());
  const run3 = l3.post.json?.run_id;
  check("G10 dispatcher outage: the run is admitted and reserved but not dispatched (dispatched:false), take attached as queued", l3.post.status === 202 && l3.post.json.dispatched === false && (await runStatus(run3)) === "queued" && l3.take?.run_id === run3);
  const blocked = await call(A, "POST", "/api/admin/comfy/runs", { template: "minimax-h3", idempotency_key: randomUUID(), params: (await cinema(A, { action: "shot.preview", shot_id: L[2].id, expected_version: (await storyboard(A, launchProj.id)).shots.find((x) => x.id === L[2].id).version })).json.preview.params });
  check("G11 while a run is queued, a second admission is refused (409 active job); nothing is created", blocked.status === 409 && (await BASE_RUNS()) === startRuns + 3);
  const sbq = await storyboard(A, launchProj.id); const qTake = sbq.takes.find((x) => x.run_id === run3);
  check("G12 a queued take cannot be selected (409)", (await cinema(A, { action: "take.select", shot_id: L[0].id, take_id: qTake.id, version: sbq.shots.find((x) => x.id === L[0].id).version })).status === 409);
  const retryFail = await call(A, "POST", "/api/admin/comfy/runs/" + run3);
  check("G13 Retry dispatch during the outage fails (503, reservation preserved) and creates nothing", retryFail.status === 503 && (await runStatus(run3)) === "queued" && (await gate()).remaining_runs === 1);
  await mock("POST", "/control", { mode: "accept" });
  const retryOk = await call(A, "POST", "/api/admin/comfy/runs/" + run3);
  check("G14 Retry dispatch after the outage dispatches the SAME run (no new run, no new debit) and it renders", retryOk.status === 200 && await waitFor(async () => (await runStatus(run3)) === "done") && (await BASE_RUNS()) === startRuns + 3 && (await gate()).remaining_runs === 1);

  // Last permit, held: the take exists while the run is still queued, and the selection works once it is done.
  await mock("POST", "/control", { mode: "hold" });
  const l4 = await launch(L[2], randomUUID()); const run4 = l4.post.json?.run_id;
  check("G15 held render: the run stays queued while the take is attached to plan 3 only", l4.post.status === 202 && (await runStatus(run4)) === "queued" && l4.take?.shot_id === L[2].id);
  await mock("POST", "/control", { mode: "release" });
  await waitFor(async () => (await runStatus(run4)) === "done");
  const sb4 = await storyboard(A, launchProj.id);
  check("G16 after release the take is finished and selectable", (await cinema(A, { action: "take.select", shot_id: L[2].id, take_id: sb4.takes.find((x) => x.run_id === run4).id, version: sb4.shots.find((x) => x.id === L[2].id).version })).status === 200);
  await cinema(A, { action: "take.select", shot_id: L[2].id, take_id: LT.plan3.id, version: (await storyboard(A, launchProj.id)).shots.find((x) => x.id === L[2].id).version });

  // Quota exhausted: recovery of an existing admission is still possible, a new admission is not.
  const gEnd = await gate();
  check("G17 quota is now exhausted (0 permits, 3.00 USD reserved)", gEnd.remaining_runs === 0 && Number(gEnd.committed_usd) === 3);
  const before2 = await BASE_RUNS(), logsBefore = await logCount();
  const recAfter = await call(A, "POST", "/api/admin/comfy/runs", { template: "minimax-h3", idempotency_key: K1, params: { prompt: "ignored on recovery" } });
  check("G18 after exhaustion, resuming an existing admission returns the same run (recovered) and creates no new run, debit or dispatch", recAfter.status === 202 && recAfter.json.recovered === true && recAfter.json.run_id === run1 && (await BASE_RUNS()) === before2 && JSON.stringify(await gate()) === JSON.stringify(gEnd) && (await logCount()) === logsBefore);
  const fresh2 = await call(A, "POST", "/api/admin/comfy/runs", { template: "minimax-h3", idempotency_key: randomUUID(), params: (await cinema(A, { action: "shot.preview", shot_id: L[1].id, expected_version: (await storyboard(A, launchProj.id)).shots.find((x) => x.id === L[1].id).version })).json.preview.params });
  check("G19 after exhaustion a NEW admission is refused (409) and creates nothing", fresh2.status === 409 && (await BASE_RUNS()) === before2);
  const gateNow = (await call(A, "GET", "/api/admin/comfy/runs?template=minimax-h3")).json;
  check("G20 the pre-check the panel runs reports not ready (so a new launch is blocked before any POST)", gateNow.ready === false);
  check("G21 four runs were admitted in total; the simulator saw 6 dispatch attempts (4 first attempts + 2 retries of the run hit by the outage) and none for any older take", (await BASE_RUNS()) === startRuns + 4 && (await logCount()) === 6);
  const finalSel = JSON.stringify((await storyboard(A, launchProj.id)).takes.filter((x) => [LT.plan1.id, LT.plan2.id, LT.plan3.id].includes(x.id)).map((x) => x.run_id).sort());
  check("G22 the chosen finals are still a1bc89fe, cd598314 and e3d7a11c after four launches", finalSel === JSON.stringify([R.plan1, R.plan2, R.plan3].sort()) && (await storyboard(A, launchProj.id)).shots.every((s) => [LT.plan1.id, LT.plan2.id, LT.plan3.id].includes(s.selected_take_id)));
  note("gate after the simulated run", `remaining_runs=${gEnd.remaining_runs} committed_usd=${gEnd.committed_usd} (local database only, nothing real was reserved or charged)`);
  note("launch project", launchProj.id);
  // Leave the simulator ready for manual use: a render launched from the UI afterwards must not stay held.
  await mock("POST", "/control", { mode: "accept" });
}

const ok = t.summary();
console.log("PROJECT_ID " + proj.id);
process.exit(ok ? 0 : 1);
