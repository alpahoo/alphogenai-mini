// THE single real GPU render of the LongCat avatar (Luz), driven from /admin/studio/avatar on the STAGING Preview of #125.
//
//     node tools/avatar-staging/real-render-luz.mjs                       # dry run: checks only, changes nothing, spends nothing
//     node tools/avatar-staging/real-render-luz.mjs --confirm-gpu-spend   # ONLY after the owner's explicit go-ahead
//
// Cost (H100 0.001097 USD/s measured on the POC, CPU/memory ~0.00024 USD/s): expected ~0.55 USD (cold load ~170 s + 3 segments
// ~185 s + 60 s scale-down), HARD ceiling ~0.96 USD (the worker is killed at 720 s). Application reservation: 0.75 USD (one run).
// Why it cannot loop: one authorised run in the gate, one SQL claim per run, no retry of a paid execution, worker timeout 720 s.
//
// What it does: disposable admin account -> Modal staging app redeployed WITHOUT the simulation flag -> temporary Protection
// Bypass + admin e-mail on the #125 Preview -> gate open for ONE run (2 h) -> the UI uploads the Luz portrait and voice, sets the
// validated prompt, clicks Render, waits, downloads the MP4 through the page's own button -> cleanup (gate closed, account and its
// files deleted, bypass revoked, Preview variable restored, Modal app back to SIMULATION mode). Existing accounts and production
// are never touched. The MP4 is kept ONLY on this computer (tmp/avatar-staging/luz/).
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ROOT, WORK, SHOTS, PROJECT, STAGING_REF, PROD_REF, STAGING_URL, BR, WIN, log, clean, rand, sh, vapi, pullBranchEnv, setAdminEmails,
  stagingKeys, launchChromium, waitLatestReady, redeploy, waitReady, fetcherFor, bundleRefs, signIn } from "./shared.mjs";
import { sleep } from "../avatar-local/lib.mjs";
import { cleanupData } from "./cleanup.mjs";

const GO = process.argv.includes("--confirm-gpu-spend");
const LUZ = path.join(WORK, "luz");
const PORTRAIT = path.join(LUZ, "luz_face_1152.jpg");   // same face as luz_face.png (1920x2560, 8 MB), resized under the 4.5 MB upload limit
const VOICE = path.join(LUZ, "luz_fr.wav");             // validated Emma voice, 16 kHz mono, 9.68 s
const OUT = path.join(LUZ, "luz_avatar_staging.mp4");
const PROMPT = "A young woman with long curly dark hair and light blue eyes, wearing a white t-shirt, facing the camera in a front-facing close-up, centred in frame, soft even light, plain light grey background. She speaks in French with a natural friendly expression, her mouth clearly visible, subtle natural head movement.";
const MODAL_ENV = "comfy-staging", MODAL_SOURCE_ENV = "comfy-admin";
mkdirSync(SHOTS, { recursive: true });

const notes = [], checks = [];
const check = (name, pass, detail = "") => { checks.push({ name, pass: !!pass, detail: clean(detail) }); log(`   ${pass ? "PASS" : "FAIL"} ${name}${!pass && detail ? ` (${clean(detail)})` : ""}`); };
const state = { ids: [], bypass: null, adminEmails: null, adminChanged: false, gateOpened: false, modalReal: false };
let db = null, keys = null, browser = null, ok = false;

import { spawnSync } from "node:child_process";
const run2 = (cmd, args, env) => spawnSync(cmd, args, { encoding: "utf8", cwd: ROOT, env, maxBuffer: 1 << 28 });
function modalDeploy(simulate) {
  const py = path.join(WORK, "venv", WIN ? "Scripts/python.exe" : "bin/python");
  if (!existsSync(py)) throw new Error("the Modal venv is missing; run run-hosted-staging.mjs once first");
  const base = { ...process.env, PYTHONUTF8: "1" };
  const region = run2(py, ["-c", `import modal;f=modal.Function.from_name("alphogenai-comfy","broker",environment_name="${MODAL_SOURCE_ENV}");f.hydrate();print(f._get_metadata().input_plane_region)`], base).stdout.trim();
  if (!region) throw new Error("could not read the approved Modal region from the deployed pilot");
  const env = { ...base, H3_MODAL_REGION: region, H3_SOURCE_ENVIRONMENT: "main", H3_MODELS_VOLUME: "alphogenai-comfy-staging-models" };
  delete env.AVATAR_SIMULATE; delete env.AVATAR_SIMULATE_SUPABASE_REF;
  if (simulate) { env.AVATAR_SIMULATE = "no-gpu-staging-only"; env.AVATAR_SIMULATE_SUPABASE_REF = STAGING_REF; }
  return run2(py, ["-m", "modal", "deploy", "-m", "modal_app.comfy.app", "--env", MODAL_ENV], env).status === 0;
}

try {
  log(`mode: ${GO ? "REAL GPU RENDER (confirmed by the owner)" : "DRY RUN: checks only, no change, no spend"}`);
  log("1/8 staging keys and prerequisites (in memory)");
  keys = stagingKeys();
  db = createClient(STAGING_URL, keys.service, { auth: { persistSession: false } });
  if ((await db.auth.admin.listUsers({ perPage: 1 })).error) throw new Error("the staging service key does not work");
  for (const f of [PORTRAIT, VOICE]) if (!existsSync(f)) throw new Error(`missing input: ${path.relative(ROOT, f)}`);
  check("Luz portrait copy under the 4.5 MB upload limit", statSync(PORTRAIT).size < 4_400_000, `${statSync(PORTRAIT).size} bytes`);
  check("Luz voice WAV under 3 MiB", statSync(VOICE).size < 3 * 1024 * 1024, `${statSync(VOICE).size} bytes`);
  const gate0 = (await db.from("comfy_runtime_gates").select("enabled,remaining_runs").eq("runtime", "longcat-avatar@1").single()).data;
  check("the LongCat gate is closed before the session", gate0?.enabled === false && gate0?.remaining_runs === 0, JSON.stringify(gate0));
  const e = pullBranchEnv(BR.longcat);
  check("#125 Preview targets staging and has the LongCat variables", e.NEXT_PUBLIC_SUPABASE_URL === STAGING_URL && e.COMFY_LONGCAT_ENABLED === "true" && !!e.COMFY_DISPATCH_URL);
  state.adminEmails = e.NEXT_PUBLIC_ADMIN_EMAILS;
  if (!state.adminEmails || state.adminEmails.includes("…")) throw new Error("admin e-mails not readable; nothing changed");
  if (!GO) { ok = checks.every((c) => c.pass); notes.push("dry run only: nothing was changed and nothing was spent"); throw new Error("__done__"); }

  log("2/8 disposable admin account");
  const email = `avatar-luz-${rand(3)}@example.com`, password = randomBytes(18).toString("base64url");
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error("could not create the disposable account");
  const uid = created.data.user.id; state.ids.push(uid);
  await db.from("profiles").update({ plan: "premium" }).eq("id", uid);

  log("3/8 Modal staging app WITHOUT the simulation flag (CPU image is cached; the GPU is only billed when a render runs)");
  state.modalReal = true;
  if (!modalDeploy(false)) throw new Error("modal deploy (real mode) failed");

  log("4/8 temporary bypass, admin e-mail on the #125 Preview, redeploy, target check");
  const head = sh("git", ["rev-parse", "HEAD"]).out.trim().slice(0, 7);
  await waitLatestReady(BR.longcat, head);
  const bypassSecret = randomBytes(16).toString("hex");
  vapi("PATCH", `/v1/projects/${PROJECT}/protection-bypass`, { generate: { secret: bypassSecret, note: "luz real render (temporary)" } });
  state.bypass = bypassSecret;
  setAdminEmails(`${state.adminEmails},${email}`, BR.longcat); state.adminChanged = true;
  const host = redeploy(BR.longcat); await waitReady(host);
  const fetcher = fetcherFor(state.bypass);
  const { refs } = await bundleRefs(fetcher, `https://${host}`);
  if (!refs.includes(STAGING_REF) || refs.some((x) => x !== STAGING_REF) || refs.includes(PROD_REF)) throw new Error(`SAFETY STOP: the Preview does not target staging only (${refs.join(",") || "none"})`);
  check("the Preview bundle targets the staging project only", true);

  log("5/8 gate: ONE run, 0.75 USD, 2 hours");
  const g = await db.from("comfy_runtime_gates").update({ enabled: true, licence_confirmed_at: new Date().toISOString(), allowed_user_id: uid, expires_at: new Date(Date.now() + 2 * 3600_000).toISOString(), remaining_runs: 1, budget_usd: 0.75, committed_usd: 0 }).eq("runtime", "longcat-avatar@1");
  if (g.error) throw new Error("could not open the gate");
  state.gateOpened = true;

  log("6/8 the render, driven from /admin/studio/avatar");
  const sess = await signIn(keys.anon, email, password);
  const base = `https://${host}`;
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 }, colorScheme: "dark", acceptDownloads: true });
  await context.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch { /* blocked */ } });
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${base}/login?x-vercel-protection-bypass=${state.bypass}&x-vercel-set-bypass-cookie=true`, { waitUntil: "domcontentloaded" });
  await context.addCookies(sess.cookies().map((c) => ({ name: c.name, value: c.value, url: base })));
  await page.goto(`${base}/admin/studio/avatar`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.setInputFiles('input[aria-label="Portrait file"]', PORTRAIT);
  await page.fill('input[aria-label="Portrait name"]', "Luz");
  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("radio", { name: /Luz/ }).first().waitFor({ timeout: 60_000 });
  await page.setInputFiles('input[aria-label="Audio file"]', VOICE);
  await page.fill('input[aria-label="Audio name"]', "Luz voix FR");
  await page.getByRole("button", { name: "Add" }).nth(1).click();
  await page.getByRole("radio", { name: /Luz voix FR/ }).waitFor({ timeout: 60_000 });
  await page.getByRole("radio", { name: /Luz voix FR/ }).click();
  await page.getByRole("button", { name: /Advanced/ }).click();
  await page.fill("#avatar-prompt", PROMPT);
  await page.screenshot({ path: path.join(SHOTS, "luz-before-render.png"), fullPage: false });
  const costLine = await page.locator("text=/estimated .* USD/").first().textContent().catch(() => "");
  notes.push(`cost line shown by the page: ${clean(costLine)}`);
  const btn = page.getByRole("button", { name: /Render avatar/ });
  check("Render is enabled for the authorised admin", await btn.isEnabled());
  const t0 = Date.now();
  await btn.click();
  await page.waitForSelector("video", { timeout: 12 * 60_000 }).catch(() => {});
  const seconds = Math.round((Date.now() - t0) / 1000);
  const run = (await db.from("comfy_runs").select("id,status,error_code,generation_seconds,finance_status,reserved_cost_usd").eq("user_id", uid).order("created_at", { ascending: false }).limit(1)).data?.[0];
  notes.push(`run: ${JSON.stringify(run ?? null)}; wall time ${seconds} s`);
  check("the render finished (done) and the player is shown", run?.status === "done", `${run?.status} ${run?.error_code ?? ""}`);
  const count = (await db.from("comfy_runs").select("id").eq("user_id", uid)).data?.length ?? 0;
  check("exactly ONE run exists for the session (no duplicate GPU execution)", count === 1, String(count));
  await page.screenshot({ path: path.join(SHOTS, "luz-done.png"), fullPage: false });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }).catch(() => null), page.getByRole("button", { name: /Download MP4/ }).click().catch(() => null)]);
  if (download) { await download.saveAs(OUT); const buf = readFileSync(OUT); check("the MP4 was downloaded (ftyp box, > 100 kB)", buf.length > 100_000 && buf.subarray(4, 8).toString() === "ftyp", `${buf.length} bytes`); }
  else check("the MP4 was downloaded", false, "no download event");
  ok = checks.every((c) => c.pass);
} catch (e) {
  if (e.message !== "__done__") { notes.push(`STOPPED: ${clean(e.message)}`); log(`STOPPED: ${clean(e.message)}`); }
} finally {
  log("7/8 cleanup (always)");
  try { await browser?.close(); } catch { /* closed */ }
  const cleanup = async (name, fn) => { try { await fn(); notes.push(`cleanup ok: ${name}`); } catch (e) { notes.push(`cleanup FAILED: ${name} (${clean(e.message)})`); } };
  if (db && state.gateOpened) await cleanup("gate closed", async () => { const r = await db.from("comfy_runtime_gates").update({ enabled: false, licence_confirmed_at: null, allowed_user_id: null, expires_at: null, remaining_runs: 0, budget_usd: 0, committed_usd: 0 }).eq("runtime", "longcat-avatar@1"); if (r.error) throw r.error; });
  if (db && state.ids.length) {
    await cleanup("rows and files of the disposable account", async () => { const n = await cleanupData(db, state.ids); if (n.length) throw new Error(n.join("; ")); });
    for (const id of state.ids) await cleanup(`account ${id.slice(0, 8)} deleted`, async () => { const r = await db.auth.admin.deleteUser(id); if (r.error) throw r.error; });
  }
  if (state.bypass) await cleanup("temporary protection bypass revoked", async () => { vapi("PATCH", `/v1/projects/${PROJECT}/protection-bypass`, { revoke: { secret: state.bypass, regenerate: false } }); });
  if (state.adminChanged) await cleanup("admin e-mail list restored on the #125 Preview", async () => setAdminEmails(state.adminEmails, BR.longcat));
  if (state.adminChanged) await cleanup("#125 Preview rebuilt without the disposable e-mail", async () => { redeploy(BR.longcat); });
  if (state.modalReal) await cleanup("Modal staging app back to SIMULATION mode (no GPU)", async () => { if (!modalDeploy(true)) throw new Error("modal deploy (simulation) failed"); });
  if (GO) await cleanup("no bypass secret left on the project", async () => { const n = Object.keys(vapi("GET", `/v9/projects/${PROJECT}`).protectionBypass ?? {}).length; notes.push(`bypass secrets left: ${n}`); if (n !== 0) throw new Error(`${n} left`); });
  const md = [`# Luz real render on staging (${new Date().toISOString()})`, "", `Mode: ${GO ? "REAL" : "dry run"}. Result: **${ok ? "PASS" : GO ? "FAIL" : (ok ? "dry run OK" : "dry run FAIL")}**`, "",
    ...checks.map((c) => `- ${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass || !c.detail ? "" : ` (${c.detail})`}`), "", ...notes.map((n) => `- ${n}`), ""].join("\n");
  writeFileSync(path.join(WORK, "luz-report.md"), md);
  log(md);
  process.exitCode = ok ? 0 : 1;
}
