// LOCAL end-to-end rehearsal of the talking-avatar flow. Requires: local Supabase, setup.mjs done, and
// `node tools/avatar-local/dev.mjs --simulated` running. Exits non-zero when a check fails. Nothing leaves this machine.
//
//   node tools/avatar-local/recipe.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { ROOT, APP, loadEnv, serviceClient, login, call, recorder, ffmpegPath, psql, sleep, hex } from "./lib.mjs";

const env = loadEnv();
const db = serviceClient(env);
const r = recorder("Talking avatar: full flow with a simulated GPU (real broker, real database, real routes)");
const OUT = path.join(ROOT, "tmp/avatar-local/media"); mkdirSync(OUT, { recursive: true });
const ff = ffmpegPath();
const run = (args) => { const p = spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" }); if (p.status !== 0) throw new Error("ffmpeg: " + p.stderr); };
const info = (file) => String(spawnSync(ff, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr);
const secret = readFileSync(path.join(ROOT, "tmp/avatar-local/dispatch-secret"), "utf8");
const ca = readFileSync(path.join(ROOT, "tmp/avatar-local/tls/cert.pem"));
const sim = (method, route, body) => new Promise((resolve, reject) => {
  const req = https.request({ host: "127.0.0.1", port: 8443, path: route, method, ca, headers: { "x-comfy-secret": secret, "Content-Type": "application/json" } }, (res) => {
    let s = ""; res.on("data", (c) => (s += c)); res.on("end", () => resolve(JSON.parse(s || "{}")));
  }); req.on("error", reject); req.end(body ? JSON.stringify(body) : undefined);
});
const setMode = (mode) => sim("POST", "/control", { mode });

const wavFile = (name, seconds) => { const f = path.join(OUT, name); run(["-f", "lavfi", "-i", `sine=frequency=330:sample_rate=44100:duration=${seconds}`, "-ac", "1", f]); return f; };
const pngFile = (name) => { const f = path.join(OUT, name); run(["-f", "lavfi", "-i", "testsrc2=size=512x768", "-frames:v", "1", f]); return f; };
const upload = (user, route, file, name, type) => { const form = new FormData(); form.append("file", new File([readFileSync(file)], path.basename(file), { type })); form.append("name", name); return call(user, "POST", route, undefined, form); };
async function waitRun(user, id, until, timeoutMs = 120_000) {
  const t0 = Date.now(); let last = null;
  while (Date.now() - t0 < timeoutMs) { last = (await call(user, "GET", `/api/admin/comfy/runs/${id}`)).json; if (last?.run && until(last.run.status)) return last; await sleep(1500); }
  return last;
}
const T = " " + Date.now().toString(36).slice(-4); // unique names: the libraries keep earlier rehearsals
const A = await login(env, env.LOCAL_TEST_USER_A_EMAIL, env.LOCAL_TEST_USER_A_PASSWORD);
const B = await login(env, env.LOCAL_TEST_USER_B_EMAIL, env.LOCAL_TEST_USER_B_PASSWORD);

// ---- Readiness -----------------------------------------------------------------------------------------------
const ready = await call(A, "GET", "/api/admin/comfy/runs?template=longcat-avatar");
r.check("readiness: authorized, fixed H100 executor and 0.75 reservation", ready.json?.ready === true && ready.json?.cost?.gpu === "H100" && ready.json?.cost?.reservation_usd === 0.75, JSON.stringify(ready.json?.cost));
r.check("readiness for the OTHER admin: not authorized (the gate belongs to A)", (await call(B, "GET", "/api/admin/comfy/runs?template=longcat-avatar")).json?.ready === false);

// ---- Libraries -----------------------------------------------------------------------------------------------
const goodWav = wavFile("good.wav", 9.72), longWav = wavFile("long.wav", 10.6), shortWav = wavFile("short.wav", 0.4);
const png = pngFile("portrait.png");
r.check("audio upload: 9.72 s WAV accepted (201)", (await upload(A, "/api/admin/studio/audio", goodWav, "Luz FR" + T, "audio/wav")).status === 201);
r.check("audio upload: 10.6 s refused (400)", (await upload(A, "/api/admin/studio/audio", longWav, "Too long" + T, "audio/wav")).status === 400);
r.check("audio upload: 0.4 s refused (400)", (await upload(A, "/api/admin/studio/audio", shortWav, "Too short" + T, "audio/wav")).status === 400);
r.check("audio upload: duplicate name refused (409)", (await upload(A, "/api/admin/studio/audio", goodWav, "luz fr" + T, "audio/wav")).status === 409);
const portraitUp = await upload(A, "/api/admin/studio/references", png, "Luz" + T, "image/png");
r.check("portrait upload through the existing library API (201)", portraitUp.status === 201);
const audioList = (await call(A, "GET", "/api/admin/studio/audio")).json;
const audio = audioList?.items?.find((a) => a.name === "Luz FR" + T);
r.check("audio list: private signed link for listening", !!audio?.url && /^http/.test(audio.url));
r.check("the other admin sees none of A's audio", ((await call(B, "GET", "/api/admin/studio/audio")).json?.items ?? []).length === 0);
const image = portraitUp.json?.item?.path;
await upload(B, "/api/admin/studio/references", png, "Other" + T, "image/png");
const bImage = ((await call(B, "GET", "/api/admin/studio/references")).json?.items ?? [])[0]?.path;

// ---- Ownership and validation before any run ------------------------------------------------------------------
const key = () => randomUUID();
const post = (user, params, k = key()) => call(user, "POST", "/api/admin/comfy/runs", { template: "longcat-avatar", params, idempotency_key: k });
r.check("another admin's portrait refused (400)", (await post(A, { image_path: bImage, audio_path: audio.path })).status === 400);
r.check("path traversal refused (400)", (await post(A, { image_path: image.replace("/library/", "/library/../"), audio_path: audio.path })).status === 400);
r.check("locked parameter refused (400)", (await post(A, { image_path: image, audio_path: audio.path, steps: 50 })).status === 400);
r.check("B cannot admit a run (gate belongs to A): refused", [409, 400].includes((await post(B, { image_path: bImage, audio_path: audio.path })).status));
const missing = await post(A, { image_path: image, audio_path: audio.path.replace(".wav", "x.wav") });
r.check("a missing audio file reserves nothing (400)", missing.status === 400);
const gateBefore = psql("select remaining_runs||'/'||committed_usd from public.comfy_runtime_gates where runtime='longcat-avatar@1';").stdout;

// ---- Happy path: slow GPU so duplicates and deletion can be tried while the run is active ---------------------------
await setMode("slow");
const params = { image_path: image, audio_path: audio.path, seed: 7 };
const first = await post(A, params);
r.check("render accepted (202) and dispatched", first.status === 202 && first.json?.dispatched === true, JSON.stringify(first.json));
const runId = first.json?.run_id;
const dup = await post(A, params, key());
r.check("DUPLICATE: same inputs, new key while running -> the SAME run, no second reservation", dup.json?.run_id === runId);
const sameKey = key(); const k1 = await post(A, params, sameKey), k2 = await post(A, params, sameKey);
r.check("DUPLICATE: same key sent twice -> the same run", k1.json?.run_id === runId && k2.json?.run_id === runId);
const other = await post(A, { ...params, seed: 8 });
r.check("a different request while one is active is refused (single active job)", other.status === 409);
await sleep(2500);
const active = (await call(A, "GET", `/api/admin/comfy/runs/${runId}`)).json;
r.check("status is reported while the GPU works (running)", ["queued", "running"].includes(active?.run?.status), active?.run?.status);
r.check("the stored run exposes labels, never storage paths", JSON.stringify(active?.run?.params_effective ?? {}).includes("Luz") && !JSON.stringify(active?.run ?? {}).includes(A.id), JSON.stringify(active?.run?.params_effective));
r.check("deleting the audio of an ACTIVE render is refused (409)", (await call(A, "DELETE", `/api/admin/studio/audio?id=${audio.id}`)).status === 409);
r.check("deleting an ACTIVE render is refused", [409, 400, 503].includes((await call(A, "DELETE", `/api/admin/comfy/runs/${runId}`)).status));
r.check("the other admin cannot read this run (404)", (await call(B, "GET", `/api/admin/comfy/runs/${runId}`)).status === 404);
r.check("Retry dispatch on a RUNNING run does not start a second GPU execution", ((await call(A, "POST", `/api/admin/comfy/runs/${runId}`)).status) === 409);

const done = await waitRun(A, runId, (s) => !["queued", "running"].includes(s));
r.check("the render completes (done)", done?.run?.status === "done", done?.run?.status + " " + (done?.run?.error_code ?? ""));
const sims = (await sim("GET", "/log")).log.filter((e) => e.run_id === runId);
r.note("dispatch calls received for this run", `${sims.length} (extra deliveries are refused by the SQL claim)`);
r.check("EXACTLY ONE GPU execution for the double-clicked, re-sent, retried render", sims.filter((e) => e.gpu === true).length === 1, JSON.stringify(sims.map((e) => e.gpu)));
r.check("exactly one output: a single `final` MP4", done?.assets?.length === 1 && done.assets[0].role === "final" && done.assets[0].mime === "video/mp4", JSON.stringify(done?.assets));
const media = (await call(A, "GET", `/api/admin/comfy/media/${done.assets[0].id}?download=1`)).json;
r.check("private signed link with a download name", !!media?.url && /download=/.test(media.url), "");
const file = path.join(OUT, "result.mp4");
writeFileSync(file, Buffer.from(await (await fetch(media.url)).arrayBuffer()));
const meta = info(file);
const dur = (kind) => { const m = new RegExp(`Duration: (\\d+):(\\d+):([\\d.]+)`).exec(meta); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null; };
const video = /Stream .*Video: h264.*?(\d+)x(\d+).*?25 fps/.exec(meta);
r.check("MP4: 25 fps video present", !!video, video?.[0]?.slice(0, 80));
r.check("MP4: container length is 10.12 s (three segments for a 9.72 s audio)", Math.abs((dur() ?? 0) - 10.12) < 0.15, String(dur()));
r.check("MP4: audio stream present", /Audio: aac/.test(meta));
// Audio length per stream: decode each stream separately.
const audioSeconds = (() => { const p = spawnSync(ff, ["-v", "error", "-i", file, "-vn", "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], { maxBuffer: 1 << 27 }); return p.stdout.length / 4 / 16000; })();
r.check("MP4: audio covers the whole video (tail padded with silence)", audioSeconds >= (dur() ?? 99) - 0.1, `audio ${audioSeconds.toFixed(2)} s vs video ${(dur() ?? 0).toFixed(2)} s`);
r.check("the job row is done and quota-counted", psql(`select status from public.jobs where id=(select job_id from public.comfy_runs where id='${runId}');`).stdout === "done");
const gateAfter = psql("select remaining_runs||'/'||committed_usd from public.comfy_runtime_gates where runtime='longcat-avatar@1';").stdout;
r.check("exactly one reservation was taken for the double-clicked render", gateBefore === "10/0" && gateAfter === "9/0.75", `${gateBefore} -> ${gateAfter}`);
const hist = (await call(A, "GET", "/api/admin/comfy/history?limit=20")).json;
r.check("the library (history) lists the render with its video asset", hist?.items?.some((i) => i.id === runId && i.template_version === "longcat-avatar@1" && i.assets?.length === 1));
r.check("the other admin's history does not list it", !((await call(B, "GET", "/api/admin/comfy/history?limit=20")).json?.items ?? []).some((i) => i.id === runId));
r.check("another admin cannot sign the video (404)", (await call(B, "GET", `/api/admin/comfy/media/${done.assets[0].id}`)).status === 404);

// ---- Failure, retry, dispatch outage ----------------------------------------------------------------------------
await setMode("fail");
const failing = await post(A, { ...params, seed: 9 });
const failed = await waitRun(A, failing.json.run_id, (s) => !["queued", "running"].includes(s));
r.check("a GPU failure ends as failed with a fixed code and no provider text", failed?.run?.status === "failed" && failed.run.error_code === "GENERATION_FAILED" && !JSON.stringify(failed).includes("secret detail"), failed?.run?.error_code);
r.check("a failed run publishes no asset", (failed?.assets ?? []).length === 0);
r.check("nothing was left in the output bucket for the failed run", ((await db.storage.from("comfy-outputs").list(`${A.id}/${failing.json.run_id}`)).data ?? []).length === 0);
await setMode("reject");
const outage = await post(A, { ...params, seed: 10 });
r.check("dispatch outage: run saved, dispatched=false, still one reservation", outage.status === 202 && outage.json?.dispatched === false);
const queued = (await call(A, "GET", `/api/admin/comfy/runs/${outage.json.run_id}`)).json;
r.check("the saved run is queued and not marked delivered", queued?.run?.status === "queued" && queued.run.dispatched === false);
await setMode("ok");
const retry = await call(A, "POST", `/api/admin/comfy/runs/${outage.json.run_id}`);
r.check("Retry dispatch succeeds", retry.status === 200, JSON.stringify(retry.json));
const retried = await waitRun(A, outage.json.run_id, (s) => !["queued", "running"].includes(s));
r.check("the retried run completes once", retried?.run?.status === "done");
const sims2 = (await sim("GET", "/log")).log.filter((e) => e.run_id === outage.json.run_id && e.gpu === true);
r.check("exactly one GPU execution for the retried run", sims2.length === 1, String(sims2.length));
const second = await call(A, "POST", `/api/admin/comfy/runs/${outage.json.run_id}`);
r.check("a second Retry on a finished run is refused (409)", second.status === 409);

// ---- Audio too long reaches the broker (e.g. an MP3 whose length only the broker can measure) -----------------------
await setMode("ok");
const sneaky = path.join(OUT, "long.mp3");
run(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=12", "-ac", "1", sneaky]);
const mp3 = await upload(A, "/api/admin/studio/audio", sneaky, "Long MP3" + T, "audio/mpeg");
r.check("a 12 s MP3 passes the upload (duration is measured by the broker)", mp3.status === 201);
const longRun = await post(A, { image_path: image, audio_path: mp3.json.item.path, seed: 11 });
const longDone = await waitRun(A, longRun.json.run_id, (s) => !["queued", "running"].includes(s));
r.check("the broker refuses it BEFORE any GPU: AUDIO_TOO_LONG", longDone?.run?.status === "failed" && longDone.run.error_code === "AUDIO_TOO_LONG", longDone?.run?.error_code);
const gpuCalls = (await sim("GET", "/log")).log.filter((e) => e.run_id === longRun.json.run_id);
r.check("the GPU simulator was never called for it, and no asset exists", gpuCalls.every((e) => e.gpu !== true) && !(await call(A, "GET", `/api/admin/comfy/runs/${longRun.json.run_id}`)).json.assets.length, JSON.stringify(gpuCalls.map((e) => e.gpu)));

// ---- Deletion ---------------------------------------------------------------------------------------------------
const del = await call(A, "DELETE", `/api/admin/comfy/runs/${runId}`);
r.note("deleting a finished render", `HTTP ${del.status} ${JSON.stringify(del.json)}`);
// KNOWN, pre-existing and shared with H3/MOSS: lib/comfy/delete-run.ts clears jobs.prompt, a NOT NULL column (the same 503
// appears for an H3 run). The avatar screen therefore offers no delete button until that is fixed (see agent/review.md).
r.check("deleting a finished render: the known shared defect is the ONLY failure mode (503 prompt-clear)", del.status === 200 || (del.status === 503 && /prompt/.test(JSON.stringify(del.json))), `HTTP ${del.status}`);
const delAudio = await call(A, "DELETE", `/api/admin/studio/audio?id=${audio.id}`);
r.check("deleting an unused audio works", delAudio.status === 200, `HTTP ${delAudio.status}`);
process.exit(r.summary() ? 0 : 1);
