// ONE command for the hosted STAGING rehearsal of #125 (LongCat), #119 (Cinema) and #123 (Parallax). Run by the project owner:
//
//     node tools/avatar-staging/run-hosted-staging.mjs
//
// What it does, in order (every change is recorded and undone in `finally`, even if a check fails):
//   1. Obtains the staging API keys IN MEMORY through the Supabase CLI (one browser authorisation the first time: `supabase login`).
//      Refuses to continue unless the project is exactly hhearpympdflxyfmszap. No key is ever printed or written to a file
//      (the Modal secret file and the Vercel inputs are created, used and deleted inside this process).
//   2. Creates two disposable staging accounts (admin / non-admin, random passwords kept only in memory).
//   3. Modal: venv with modal==1.6.3, secret `alphogenai-comfy-broker` in environment `comfy-staging`, deploy of the app with the
//      NO-GPU simulation mode (fail-closed on any other database), reads the dispatch URL.
//   4. Vercel (Preview variables of the three branches ONLY): adds the disposable admin e-mail to NEXT_PUBLIC_ADMIN_EMAILS of
//      #119/#123 and sets the staging variables of #125; creates a TEMPORARY Protection Bypass for Automation secret on the project
//      (needed because Previews are SSO-protected); redeploys the three Previews and waits for READY.
//   5. VERIFIES that each Preview targets the staging project (project id read from its client bundle). Any other result aborts
//      BEFORE any authenticated call or write.
//   6. Opens the LongCat gate for the disposable admin (5 runs, 3.75 USD application budget, 3 hours) and runs the API checks.
//   7. Always: closes the gate, deletes the disposable accounts, their rows and files, empties the test module flag, revokes the
//      bypass secret, restores the Preview variables, redeploys the Previews, deletes temporary files, writes the report.
//
// Existing accounts and production are never touched. No GPU is used.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { checksLongcat, checksCinema, checksParallax, VISUAL_TODO } from "./checks.mjs";
import { sleep } from "../avatar-local/lib.mjs";
import { cleanupData } from "./cleanup.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = path.join(ROOT, "tmp/avatar-staging");
const TEAM = "team_kq6TRybfPHjJYkfAlQXGDpI2";
const PROJECT = "prj_D2woxz7R5y0hBB1pd0WQGYmWGkDV";
const STAGING_REF = "hhearpympdflxyfmszap", PROD_REF = "qbrpzmuedfugbhoeytdj";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const MODAL_ENV = "comfy-staging", MODAL_SOURCE_ENV = "comfy-admin";
const BR = { longcat: "claude/longcat-avatar-integration", cinema: "feat/cinema-m1-persistence", parallax: "codex/parallax-coexistence" };
const WIN = process.platform === "win32";
const log = (m) => console.log(m);
const rand = (n) => randomBytes(n).toString("hex");

mkdirSync(WORK, { recursive: true });
const statePath = path.join(WORK, "state.json");
const state = { startedAt: new Date().toISOString(), emails: {}, ids: {}, bypassSecretCreated: false, varsChanged: [], gateOpened: false, notes: [] };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const reports = [];

const quote = (x) => (/[&|<>^%\s"]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x);
function sh(cmd, args, { input, env, cwd, capture = true, allowFail = false } = {}) {
  const useShell = WIN && ["npx", "node"].includes(cmd);
  const r = spawnSync(cmd, useShell ? args.map(quote) : args, { input, encoding: "utf8", env: { ...process.env, ...env }, cwd: cwd ?? ROOT, shell: useShell, maxBuffer: 1 << 28, stdio: capture ? ["pipe", "pipe", "pipe"] : ["inherit", "inherit", "inherit"] });
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed (exit ${r.status}): ${String(r.stderr || "").trim().split("\n").slice(-2).join(" ").slice(0, 200)}`);
  return { out: String(r.stdout || ""), err: String(r.stderr || ""), status: r.status };
}
const vercel = (args, opts) => sh("npx", ["--yes", "vercel@latest", ...args, "--scope", TEAM], opts);
const vapi = (method, route, body) => {
  const sep = route.includes("?") ? "&" : "?";
  const r = vercel(["api", `${route}${sep}teamId=${TEAM}`, "-X", method, ...(body ? ["--input", "-"] : []), "--raw"], { input: body ? JSON.stringify(body) : undefined });
  try { return JSON.parse(r.out); } catch { return {}; }
};
function parseDotenv(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) { if (!line || line.startsWith("#") || !line.includes("=")) continue; const i = line.indexOf("="); map[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, ""); }
  return map;
}
function pullBranchEnv(branch) {
  const file = path.join(WORK, `pull-${rand(4)}.env`);
  try {
    vercel(["env", "pull", file, "--environment=preview", `--git-branch=${branch}`, "--project", PROJECT, "--yes"]);
    return parseDotenv(readFileSync(file, "utf8"));
  } finally { rmSync(file, { force: true }); }
}
const setVar = (name, value, branch, { secret = false } = {}) => {
  vercel(["env", "add", name, "preview", "--git-branch", branch, "--force", secret ? "--sensitive" : "--no-sensitive", "--project", PROJECT], { input: value });
};

// ---- 1. keys ----------------------------------------------------------------------------------------------------
function stagingKeys() {
  const run = () => sh("npx", ["--yes", "supabase@3.2.0", "projects", "api-keys", "--project-ref", STAGING_REF, "-o", "json"], { allowFail: true });
  let r = run();
  if (r.status !== 0) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Supabase CLI is not logged in and this is not an interactive terminal. Once, in a normal terminal (cmd.exe is fine), run: npx supabase@3.2.0 login  (a browser page opens, authorise, paste the verification code into the terminal). The token is then stored for later runs.");
    }
    log("   Supabase CLI is not logged in: a browser page opens once to authorise it (no password involved).");
    sh("npx", ["--yes", "supabase@3.2.0", "login"], { capture: false });
    r = run();
    if (r.status !== 0) throw new Error("Supabase CLI could not list the staging API keys");
  }
  const list = JSON.parse(r.out.slice(r.out.indexOf("[")));
  const pick = (name) => list.find((k) => k.name === name)?.api_key;
  const anon = pick("anon"), service = pick("service_role");
  if (!anon || !service) throw new Error("anon / service_role keys not found");
  return { anon, service };
}

// ---- 3. Modal ---------------------------------------------------------------------------------------------------
function modalSetup(keys, dispatchSecret) {
  const venv = path.join(WORK, "venv");
  const py = path.join(venv, WIN ? "Scripts/python.exe" : "bin/python");
  if (!existsSync(py)) {
    log("   creating a Python venv with modal==1.6.3 (one time, about 1 minute)...");
    sh("python", ["-m", "venv", venv]);
    sh(py, ["-m", "pip", "install", "-q", "modal==1.6.3", "fastapi==0.121.1", "requests==2.32.5", "python-dotenv"]);
  }
  const dotenv = path.join(WORK, `broker-${rand(4)}.env`);
  try {
    writeFileSync(dotenv, [`SUPABASE_URL=${STAGING_URL}`, `SUPABASE_SERVICE_ROLE_KEY=${keys.service}`, `COMFY_DISPATCH_SECRET=${dispatchSecret}`, ""].join("\n"), { mode: 0o600 });
    sh(py, ["-m", "modal", "secret", "create", "alphogenai-comfy-broker", "--env", MODAL_ENV, "--from-dotenv", dotenv, "--force"], { env: { PYTHONUTF8: "1" } });
  } finally { rmSync(dotenv, { force: true }); }
  // The approved region is the one the deployed pilot already uses (never printed).
  const region = sh(py, ["-c", `import modal;f=modal.Function.from_name("alphogenai-comfy","broker",environment_name="${MODAL_SOURCE_ENV}");f.hydrate();print(f._get_metadata().input_plane_region)`], { env: { PYTHONUTF8: "1" } }).out.trim();
  if (!region) throw new Error("could not read the approved Modal region from the deployed pilot");
  log("   deploying the Modal staging app (image builds can take 10-15 minutes the first time)...");
  sh(py, ["-m", "modal", "deploy", "-m", "modal_app.comfy.app", "--env", MODAL_ENV], {
    capture: false, env: { PYTHONUTF8: "1", H3_MODAL_REGION: region, H3_SOURCE_ENVIRONMENT: "main", H3_MODELS_VOLUME: "alphogenai-comfy-staging-models",
      AVATAR_SIMULATE: "no-gpu-staging-only", AVATAR_SIMULATE_SUPABASE_REF: STAGING_REF },
  });
  const url = sh(py, ["-c", `import modal;f=modal.Function.from_name("alphogenai-comfy","dispatch",environment_name="${MODAL_ENV}");f.hydrate();print(f.get_web_url())`], { env: { PYTHONUTF8: "1" } }).out.trim().split("\n").pop();
  if (!/^https:\/\//.test(url)) throw new Error("dispatch URL not found");
  return url;
}

// ---- 4/5. Vercel previews ---------------------------------------------------------------------------------------
const latestDeployment = (branch) => {
  const d = vapi("GET", `/v6/deployments?projectId=${PROJECT}&limit=1&target=preview&meta-githubCommitRef=${encodeURIComponent(branch)}`).deployments?.[0];
  if (!d) throw new Error(`no Preview deployment found for ${branch}`);
  return d;
};
function redeploy(branch) {
  const d = latestDeployment(branch);
  const r = vercel(["redeploy", `https://${d.url}`, "--no-wait"], { allowFail: false });
  const found = (r.out + r.err).match(/https:\/\/[a-z0-9-]+\.vercel\.app/g)?.pop();
  if (!found) throw new Error(`redeploy of ${branch} did not return a URL`);
  return found.replace(/^https:\/\//, "");
}
async function waitReady(host) {
  for (let i = 0; i < 90; i++) {
    const d = vapi("GET", `/v13/deployments/${host}`);
    if (d.readyState === "READY") return;
    if (["ERROR", "CANCELED"].includes(d.readyState)) throw new Error(`deployment ${host} ended ${d.readyState}`);
    await sleep(10_000);
  }
  throw new Error(`deployment ${host} not ready in 15 minutes`);
}
const makeFetcher = (bypass) => (base, p, init = {}) => fetch(base + p, { redirect: "manual", ...init, headers: { "x-vercel-protection-bypass": bypass, ...(init.headers ?? {}) } });
async function bundleRefs(fetcher, base) {
  const html = await (await fetcher(base, "/login")).text();
  const chunks = [...new Set([...html.matchAll(/static\/chunks\/[A-Za-z0-9_\-\/\[\]\.%]+\.js/g)].map((m) => m[0]))];
  const refs = new Set();
  for (const m of html.matchAll(/([a-z0-9]{20})\.supabase\.co/g)) refs.add(m[1]);
  for (const c of chunks) { const t = await (await fetcher(base, `/_next/${c}`)).text(); for (const m of t.matchAll(/([a-z0-9]{20})\.supabase\.co/g)) refs.add(m[1]); }
  return { chunks: chunks.length, refs: [...refs] };
}

// ---- sessions & requests ---------------------------------------------------------------------------------------
async function session(anonKey, email, password) {
  const jar = new Map();
  const sb = createServerClient(STAGING_URL, anonKey, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error("sign-in failed for a disposable account");
  return { id: data.user.id, cookie: () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}
function makeCtx({ base, fetcher, admin, user, db, media }) {
  const req = async (who, method, p, { json, form, headers } = {}) => {
    const h = { ...(headers ?? {}) };
    if (who === "admin") h.cookie = admin.cookie(); else if (who === "user") h.cookie = user.cookie();
    if (json) h["content-type"] = "application/json";
    const res = await fetcher(base, p, { method, headers: h, body: form ?? (json ? JSON.stringify(json) : undefined) });
    const text = await res.text(); let parsed = null; try { parsed = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json: parsed, text };
  };
  return { base: (p) => base + p, req, db, ids: { admin: admin.id, user: user.id }, media };
}

// =================================================================================================================
const result = { ok: false, steps: [], residue: [] };
let keys = null, db = null, bypass = null, dispatchSecret = null;
const originals = {};
try {
  if (process.argv.includes("--check")) {
    log("--check: read-only Vercel and Modal checks");
    log(`   Vercel user: ${vercel(["whoami"]).out.trim().split(/\r?\n/).pop()}`);
    for (const b of [BR.cinema, BR.parallax]) {
      const e = pullBranchEnv(b);
      log(`   branch ${b}: admin e-mail list ${e.NEXT_PUBLIC_ADMIN_EMAILS && !e.NEXT_PUBLIC_ADMIN_EMAILS.includes("…") ? "readable" : "NOT readable"}, targets staging: ${!!e.NEXT_PUBLIC_SUPABASE_URL?.includes(STAGING_REF)}`);
    }
    const proj = vapi("GET", `/v9/projects/${PROJECT}`);
    log(`   Vercel project: ${Object.keys(proj.protectionBypass ?? {}).length} automation bypass secret(s) at start (expected 0)`);
    const envs = sh("python", ["-m", "modal", "environment", "list"], { env: { PYTHONUTF8: "1" } }).out;
    log(`   Modal: environment ${MODAL_ENV} ${envs.includes(MODAL_ENV) ? "exists" : "MISSING"}`);
  }
  log("1/8 staging keys (in memory)");
  keys = stagingKeys();
  db = createClient(STAGING_URL, keys.service, { auth: { persistSession: false } });
  const probe = await db.auth.admin.listUsers({ perPage: 1 });
  if (probe.error) throw new Error("the staging service key does not work");
  const ref = await db.from("comfy_runtime_gates").select("runtime").eq("runtime", "longcat-avatar@1").maybeSingle();
  if (!ref.data) throw new Error("the LongCat migration is missing on this project");
  log(`   OK: project ${STAGING_REF}; existing accounts are not touched.`);
  if (process.argv.includes("--check")) { log("--check finished: nothing was changed."); process.exit(0); }

  log("2/8 disposable accounts");
  const mk = async (label) => {
    const email = `avatar-rehearsal-${label}-${rand(3)}@example.com`, password = randomBytes(18).toString("base64url");
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`could not create the ${label} account`);
    state.emails[label] = email; state.ids[label] = data.user.id; save();
    return { email, password, id: data.user.id };
  };
  const adminAcc = await mk("admin"), userAcc = await mk("user");
  await db.from("profiles").update({ plan: "premium" }).eq("id", adminAcc.id);

  log("3/8 Modal staging worker (no GPU)");
  dispatchSecret = rand(24);
  const dispatchUrl = modalSetup(keys, dispatchSecret);
  state.notes.push("modal app deployed in simulation mode"); save();

  log("4/8 Vercel Preview variables and temporary protection bypass");
  for (const b of [BR.cinema, BR.parallax]) {
    const e = pullBranchEnv(b);
    const emails = e.NEXT_PUBLIC_ADMIN_EMAILS;
    if (!emails || emails.includes("…") || !e.NEXT_PUBLIC_SUPABASE_URL?.includes(STAGING_REF)) throw new Error(`branch ${b}: admin e-mails not readable or branch not on staging; nothing changed`);
    originals[b] = emails;
  }
  const donorEmails = originals[BR.cinema];
  const bypassSecret = randomBytes(16).toString("hex");
  vapi("PATCH", `/v1/projects/${PROJECT}/protection-bypass`, { generate: { secret: bypassSecret, note: "avatar hosted rehearsal (temporary)" } });
  bypass = bypassSecret; state.bypassSecretCreated = true; save();
  const proj = vapi("GET", `/v9/projects/${PROJECT}`);
  if (!Object.keys(proj.protectionBypass ?? {}).includes(bypassSecret)) throw new Error("the temporary protection bypass could not be created; nothing else was changed");
  const add = (name, value, branch, opt) => { setVar(name, value, branch, opt); state.varsChanged.push({ name, branch }); save(); };
  add("NEXT_PUBLIC_ADMIN_EMAILS", `${originals[BR.cinema]},${adminAcc.email}`, BR.cinema);
  add("NEXT_PUBLIC_ADMIN_EMAILS", `${originals[BR.parallax]},${adminAcc.email}`, BR.parallax);
  add("NEXT_PUBLIC_SUPABASE_URL", STAGING_URL, BR.longcat);
  add("NEXT_PUBLIC_SUPABASE_ANON_KEY", keys.anon, BR.longcat);
  add("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY", keys.anon, BR.longcat);
  add("SUPABASE_SERVICE_ROLE_KEY", keys.service, BR.longcat, { secret: true });
  add("NEXT_PUBLIC_ADMIN_EMAILS", `${donorEmails},${adminAcc.email}`, BR.longcat);
  add("COMFY_LONGCAT_ENABLED", "true", BR.longcat);
  add("COMFY_DISPATCH_SECRET", dispatchSecret, BR.longcat, { secret: true });
  add("COMFY_DISPATCH_URL", dispatchUrl, BR.longcat);

  log("5/8 redeploying the three Previews and verifying their target");
  const hosts = {};
  for (const [k, b] of Object.entries(BR)) hosts[k] = redeploy(b);
  for (const h of Object.values(hosts)) await waitReady(h);
  const fetcher = makeFetcher(bypass);
  for (const [k, h] of Object.entries(hosts)) {
    const { chunks, refs } = await bundleRefs(fetcher, `https://${h}`);
    result.steps.push(`Preview ${k}: ${chunks} chunks, project ids in the bundle: ${refs.join(",") || "none"}`);
    if (!refs.includes(STAGING_REF) || refs.some((x) => x !== STAGING_REF) || refs.includes(PROD_REF)) throw new Error(`SAFETY STOP: Preview ${k} does not target the staging project only (${refs.join(",") || "none"}). No authenticated call was made.`);
  }
  log("   OK: all three Previews target the staging project only.");

  log("6/8 gate and API checks");
  const { error: gateError } = await db.from("comfy_runtime_gates").update({ enabled: true, licence_confirmed_at: new Date().toISOString(), allowed_user_id: adminAcc.id,
    expires_at: new Date(Date.now() + 3 * 3600_000).toISOString(), remaining_runs: 5, budget_usd: 3.75, committed_usd: 0 }).eq("runtime", "longcat-avatar@1");
  if (gateError) throw new Error("could not open the gate");
  state.gateOpened = true; save();
  const admin = await session(keys.anon, adminAcc.email, adminAcc.password), user = await session(keys.anon, userAcc.email, userAcc.password);
  const media = path.join(WORK, "media"); mkdirSync(media, { recursive: true });
  const ff = (await import("node:module")).createRequire(import.meta.url)("ffmpeg-static");
  const gen = (args) => sh(ff, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  gen(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=9.72", "-ac", "1", path.join(media, "good.wav")]);
  gen(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=12", "-ac", "1", path.join(media, "long.mp3")]);
  gen(["-f", "lavfi", "-i", "testsrc2=size=512x768", "-frames:v", "1", path.join(media, "portrait.png")]);
  for (const [k, fn] of [["longcat", checksLongcat], ["cinema", checksCinema], ["parallax", checksParallax]]) {
    const ctx = makeCtx({ base: `https://${hosts[k]}`, fetcher, admin, user, db, media });
    try { const r = await fn(ctx); reports.push({ pr: k, results: r.results }); } catch (e) { reports.push({ pr: k, results: [{ name: `checks crashed: ${String(e.message).slice(0, 100)}`, pass: false }] }); }
  }
  result.ok = reports.every((r) => r.results.every((x) => x.pass));
} catch (e) {
  result.error = String(e.message ?? e).replace(/eyJ[A-Za-z0-9_\-\.]+/g, "[jwt]").slice(0, 300);
  log(`STOPPED: ${result.error}`);
} finally {
  log("7/8 cleanup (always)");
  const cleanup = async (name, fn) => { try { await fn(); result.steps.push(`cleanup ok: ${name}`); } catch (e) { result.steps.push(`cleanup FAILED: ${name} (${String(e.message ?? e).slice(0, 100)})`); } };
  if (db) {
    await cleanup("gate closed", async () => { const r = await db.from("comfy_runtime_gates").update({ enabled: false, licence_confirmed_at: null, allowed_user_id: null, expires_at: null, remaining_runs: 0, budget_usd: 0, committed_usd: 0 }).eq("runtime", "longcat-avatar@1"); if (r.error) throw r.error; });
    await cleanup("test module flag emptied", async () => { await db.from("app_settings").delete().eq("key", "parallax_modules"); });
    const ids = Object.values(state.ids);
    if (ids.length) {
      await cleanup("rows and files of the disposable accounts", async () => { const notes = await cleanupData(db, ids); if (notes.length) throw new Error(notes.join("; ")); });
      for (const uid of ids) await cleanup(`account ${uid.slice(0, 8)} deleted`, async () => { const r = await db.auth.admin.deleteUser(uid); if (r.error) throw r.error; });
      for (const uid of ids) {
        const left = (await db.from("comfy_runs").select("id").eq("user_id", uid)).data?.length ?? 0;
        const u = await db.auth.admin.getUserById(uid);
        if (left || u.data?.user) result.residue.push(`account ${uid.slice(0, 8)}: runs=${left}, user ${u.data?.user ? "still exists" : "deleted"}`);
      }
    }
  }
  if (bypass) await cleanup("temporary protection bypass revoked", async () => { vapi("PATCH", `/v1/projects/${PROJECT}/protection-bypass`, { revoke: { secret: bypass, regenerate: false } }); });
  for (const b of [BR.cinema, BR.parallax]) if (originals[b] && state.varsChanged.some((v) => v.branch === b)) await cleanup(`Preview variable restored on ${b}`, async () => setVar("NEXT_PUBLIC_ADMIN_EMAILS", originals[b], b));
  if (originals[BR.cinema] && state.varsChanged.some((v) => v.branch === BR.longcat && v.name === "NEXT_PUBLIC_ADMIN_EMAILS")) await cleanup("disposable e-mail removed from the #125 Preview admin list", async () => setVar("NEXT_PUBLIC_ADMIN_EMAILS", originals[BR.cinema], BR.longcat));
  if (state.varsChanged.length) await cleanup("Previews rebuilt without the disposable e-mail", async () => { for (const b of Object.values(BR)) redeploy(b); });
  // Report (no secret, no password).
  const md = [`# Hosted staging rehearsal: report (${new Date().toISOString()})`, "", `Overall API checks: **${result.ok ? "PASS" : "FAIL"}**${result.error ? `, stopped early: ${result.error}` : ""}`, "",
    "## API checks", ...reports.flatMap((r) => [`### ${r.pr}`, ...r.results.map((x) => `- ${x.pass ? "PASS" : "FAIL"} ${x.name}`)]), "",
    "## Steps and cleanup", ...result.steps.map((s) => `- ${s}`), result.residue.length ? `\n**RESIDUE: ${result.residue.join(" | ")}**` : "\nNo residue found for the disposable accounts.", "",
    "## Visual checks still to do (not covered by the API checks)", ...VISUAL_TODO.map((s) => `- [ ] ${s}`), ""].join("\n");
  writeFileSync(path.join(WORK, "report.md"), md);
  log(md);
  log("8/8 done. Report: tmp/avatar-staging/report.md  (tell Claude: 'recette terminee')");
  process.exitCode = result.ok && !result.residue.length ? 0 : 1;
}
