// Targeted repair + replay for #123 (Parallax) ONLY. Scope authorised by the project owner:
//   - replace SUPABASE_SERVICE_ROLE_KEY on the Preview branch codex/parallax-coexistence (value = the existing staging service key,
//     never printed, never logged, never written to a file);
//   - redeploy only that branch, verify it targets staging, replay: toggle save, persistence, non-admin 403;
//   - if the save still fails, record the server-side error code (sanitised) BEFORE changing anything else.
// Out of scope: key rotation, global Vercel variables, production, other branches, existing accounts.
//
//     node tools/avatar-staging/fix-parallax.mjs [--diagnose-only]
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { checksParallax } from "./checks.mjs";
import { sleep } from "../avatar-local/lib.mjs";
import { cleanupData } from "./cleanup.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = path.join(ROOT, "tmp/avatar-staging");
const TEAM = "team_kq6TRybfPHjJYkfAlQXGDpI2", PROJECT = "prj_D2woxz7R5y0hBB1pd0WQGYmWGkDV";
const STAGING_REF = "hhearpympdflxyfmszap", PROD_REF = "qbrpzmuedfugbhoeytdj";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BRANCH = "codex/parallax-coexistence";
const WIN = process.platform === "win32";
const DIAG_ONLY = process.argv.includes("--diagnose-only");
const log = (m) => console.log(m);
const clean = (s) => String(s ?? "").replace(/eyJ[A-Za-z0-9_\-\.]+/g, "[jwt]").replace(/sb_(secret|publishable)_[A-Za-z0-9_\-]+/g, "[key]").slice(0, 300);
const rand = (n) => randomBytes(n).toString("hex");
mkdirSync(WORK, { recursive: true });

const quote = (x) => (/[&|<>^%\s"]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x);
function sh(cmd, args, { input, allowFail = false } = {}) {
  const useShell = WIN && ["npx", "node"].includes(cmd);
  const r = spawnSync(cmd, useShell ? args.map(quote) : args, { input, encoding: "utf8", cwd: ROOT, shell: useShell, maxBuffer: 1 << 28 });
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed (exit ${r.status}): ${clean(String(r.stderr || "").trim().split("\n").slice(-2).join(" "))}`);
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
function pullBranchEnv() {
  const file = path.join(WORK, `pull-${rand(4)}.env`);
  try { vercel(["env", "pull", file, "--environment=preview", `--git-branch=${BRANCH}`, "--project", PROJECT, "--yes"]); return parseDotenv(readFileSync(file, "utf8")); }
  finally { rmSync(file, { force: true }); }
}
const setVar = (name, value, { secret = false } = {}) =>
  vercel(["env", "add", name, "preview", "--git-branch", BRANCH, "--force", secret ? "--sensitive" : "--no-sensitive", "--project", PROJECT], { input: value });

function stagingKeys() {
  const r = sh("npx", ["--yes", "supabase@3.2.0", "projects", "api-keys", "--project-ref", STAGING_REF, "-o", "json"]);
  const list = JSON.parse(r.out.slice(r.out.indexOf("[")));
  const pick = (n) => list.find((k) => k.name === n)?.api_key;
  const anon = pick("anon"), service = pick("service_role");
  if (!anon || !service) throw new Error("anon / service_role keys not found");
  return { anon, service };
}
const latestDeployment = () => {
  const d = vapi("GET", `/v6/deployments?projectId=${PROJECT}&limit=1&target=preview&meta-githubCommitRef=${encodeURIComponent(BRANCH)}`).deployments?.[0];
  if (!d) throw new Error("no Preview deployment found");
  return d;
};
function redeploy() {
  const r = vercel(["redeploy", `https://${latestDeployment().url}`, "--no-wait"]);
  const found = (r.out + r.err).match(/https:\/\/[a-z0-9-]+\.vercel\.app/g)?.pop();
  if (!found) throw new Error("redeploy did not return a URL");
  return found.replace(/^https:\/\//, "");
}
async function waitReady(host) {
  for (let i = 0; i < 90; i++) {
    const d = vapi("GET", `/v13/deployments/${host}`);
    if (d.readyState === "READY") return;
    if (["ERROR", "CANCELED"].includes(d.readyState)) throw new Error(`deployment ended ${d.readyState}`);
    await sleep(10_000);
  }
  throw new Error("deployment not ready in 15 minutes");
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
async function session(anonKey, email, password) {
  const jar = new Map();
  const sb = createServerClient(STAGING_URL, anonKey, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error("sign-in failed for a disposable account");
  return { id: data.user.id, cookie: () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}
function makeCtx({ base, fetcher, admin, user, db }) {
  const req = async (who, method, p, { json, form, headers } = {}) => {
    const h = { ...(headers ?? {}) };
    if (who === "admin") h.cookie = admin.cookie(); else if (who === "user") h.cookie = user.cookie();
    if (json) h["content-type"] = "application/json";
    const res = await fetcher(base, p, { method, headers: h, body: form ?? (json ? JSON.stringify(json) : undefined) });
    const text = await res.text(); let parsed = null; try { parsed = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json: parsed, text };
  };
  return { base: (p) => base + p, req, db, ids: { admin: admin.id, user: user.id }, media: null };
}

const notes = [], state = { ids: [], bypass: null, adminEmailsOriginal: null, adminVarChanged: false, keyReplaced: false };
let db = null, keys = null, ok = false;
try {
  log("1/7 staging keys (in memory)");
  keys = stagingKeys();
  db = createClient(STAGING_URL, keys.service, { auth: { persistSession: false } });
  if ((await db.auth.admin.listUsers({ perPage: 1 })).error) throw new Error("the staging service key does not work");

  log("2/7 diagnosis of the current branch variables (booleans only, no value printed)");
  const env = pullBranchEnv();
  state.adminEmailsOriginal = env.NEXT_PUBLIC_ADMIN_EMAILS;
  const cur = env.SUPABASE_SERVICE_ROLE_KEY;
  const diag = {
    present: !!cur, readable: !!cur && !cur.includes("…"), identicalToStagingKey: cur === keys.service,
    hasLeadingOrTrailingWhitespace: !!cur && cur !== cur.trim(), hasEmbeddedWhitespaceOrQuote: !!cur && /[\s"'\\]/.test(cur.trim()),
    length: cur?.length ?? 0, expectedLength: keys.service.length, looksLikeJwt: !!cur && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(cur.trim()),
    urlIsStaging: env.NEXT_PUBLIC_SUPABASE_URL === STAGING_URL, urlHasWhitespace: !!env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  };
  notes.push(`Diagnosis of the branch variables: ${JSON.stringify(diag)}`);
  log(`   ${JSON.stringify(diag)}`);
  // What the server really gets from supabase-js with THAT value (no secret printed): error code and message only.
  if (cur) {
    const probe = createClient(env.NEXT_PUBLIC_SUPABASE_URL ?? STAGING_URL, cur, { auth: { persistSession: false } });
    const r = await probe.from("app_settings").upsert({ key: "diag_probe", value: {}, updated_at: new Date().toISOString() });
    await db.from("app_settings").delete().eq("key", "diag_probe");
    const line = `Write with the CURRENT branch key: status=${r.status ?? "?"} code=${r.error?.code ?? "none"} message=${clean(r.error?.message) || "none"}`;
    notes.push(line); log(`   ${line}`);
  }
  if (DIAG_ONLY) { ok = true; log("--diagnose-only: nothing was changed."); throw new Error("__done__"); }

  log("3/7 disposable accounts");
  const mk = async (label) => {
    const email = `avatar-rehearsal-${label}-${rand(3)}@example.com`, password = randomBytes(18).toString("base64url");
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`could not create the ${label} account`);
    state.ids.push(data.user.id);
    return { email, password, id: data.user.id };
  };
  const adminAcc = await mk("admin"), userAcc = await mk("user");

  log("4/7 branch variables (this Preview only) and temporary bypass");
  if (!state.adminEmailsOriginal || state.adminEmailsOriginal.includes("…")) throw new Error("admin e-mails not readable; nothing changed");
  const bypassSecret = randomBytes(16).toString("hex");
  vapi("PATCH", `/v1/projects/${PROJECT}/protection-bypass`, { generate: { secret: bypassSecret, note: "parallax fix replay (temporary)" } });
  state.bypass = bypassSecret;
  if (!Object.keys(vapi("GET", `/v9/projects/${PROJECT}`).protectionBypass ?? {}).includes(bypassSecret)) throw new Error("temporary bypass could not be created; nothing else changed");
  setVar("SUPABASE_SERVICE_ROLE_KEY", keys.service, { secret: true }); state.keyReplaced = true;
  setVar("NEXT_PUBLIC_ADMIN_EMAILS", `${state.adminEmailsOriginal},${adminAcc.email}`); state.adminVarChanged = true;

  log("5/7 redeploying #123 only and verifying its target");
  const host = redeploy(); await waitReady(host);
  const fetcher = makeFetcher(state.bypass);
  const { chunks, refs } = await bundleRefs(fetcher, `https://${host}`);
  notes.push(`Preview ${BRANCH}: ${chunks} chunks, project ids in the bundle: ${refs.join(",") || "none"}`);
  if (!refs.includes(STAGING_REF) || refs.some((x) => x !== STAGING_REF) || refs.includes(PROD_REF)) throw new Error(`SAFETY STOP: the Preview does not target staging only (${refs.join(",") || "none"}). No authenticated call was made.`);
  log("   OK: the Preview targets the staging project only.");

  log("6/7 replay");
  const admin = await session(keys.anon, adminAcc.email, adminAcc.password), user = await session(keys.anon, userAcc.email, userAcc.password);
  const ctx = makeCtx({ base: `https://${host}`, fetcher, admin, user, db });
  const rec = await checksParallax(ctx);
  const results = [...rec.results];
  // Persistence after reload, seen by the admin endpoint itself (fresh request, no cache) and by the DB.
  const on = await ctx.req("admin", "PATCH", "/api/admin/modules", { json: { module: "parallax_remix", enabled: true } });
  const reload = await ctx.req("admin", "GET", "/api/admin/modules");
  const row = await db.from("app_settings").select("value").eq("key", "parallax_modules").maybeSingle();
  results.push({ name: `persistence: PATCH ${on.status}; admin GET after reload shows it; the row exists in app_settings`, pass: on.status === 200 && reload.json?.modules?.parallax_remix === true && row.data?.value?.parallax_remix === true });
  const nonAdmin = await ctx.req("user", "PATCH", "/api/admin/modules", { json: { module: "parallax_remix", enabled: false } });
  const stillOn = (await db.from("app_settings").select("value").eq("key", "parallax_modules").maybeSingle()).data?.value?.parallax_remix === true;
  results.push({ name: `non-admin PATCH refused (${nonAdmin.status}) and the stored value is unchanged`, pass: nonAdmin.status === 403 && stillOn });
  for (const x of results) log(`   ${x.pass ? "PASS" : "FAIL"} ${x.name}`);
  notes.push(...results.map((x) => `${x.pass ? "PASS" : "FAIL"} ${x.name}`));
  ok = results.every((x) => x.pass);
  if (!ok) {
    // 500 persists: relevant server-side code WITHOUT changing anything else. Same value as deployed (the staging key), same call.
    const probe = createClient(STAGING_URL, keys.service, { auth: { persistSession: false } });
    const r = await probe.from("app_settings").upsert({ key: "diag_probe", value: {}, updated_at: new Date().toISOString() });
    await db.from("app_settings").delete().eq("key", "diag_probe");
    notes.push(`If a failure remains: the same upsert made directly with the staging key returns code=${r.error?.code ?? "none"} message=${clean(r.error?.message) || "none"}`);
    const recent = sh("npx", ["--yes", "vercel@latest", "logs", host, "--scope", TEAM, "--no-follow", "--limit", "40"], { allowFail: true });
    const lines = clean(recent.out + recent.err).split(/\r?\n/).filter((l) => /modules|error|Error/.test(l)).slice(0, 8);
    notes.push(`Server log lines (sanitised): ${lines.join(" | ") || "none readable"}`);
  }
} catch (e) {
  if (e.message !== "__done__") { notes.push(`STOPPED: ${clean(e.message)}`); log(`STOPPED: ${clean(e.message)}`); }
} finally {
  log("7/7 cleanup (always)");
  const cleanup = async (name, fn) => { try { await fn(); notes.push(`cleanup ok: ${name}`); } catch (e) { notes.push(`cleanup FAILED: ${name} (${clean(e.message)})`); } };
  if (db) {
    await cleanup("test module flag emptied", async () => { await db.from("app_settings").delete().in("key", ["parallax_modules", "diag_probe"]); });
    if (state.ids.length) {
      await cleanup("rows and files of the disposable accounts", async () => { const n = await cleanupData(db, state.ids); if (n.length) throw new Error(n.join("; ")); });
      for (const uid of state.ids) await cleanup(`account ${uid.slice(0, 8)} deleted`, async () => { const r = await db.auth.admin.deleteUser(uid); if (r.error) throw r.error; });
    }
  }
  if (state.bypass) await cleanup("temporary protection bypass revoked", async () => { vapi("PATCH", `/v1/projects/${PROJECT}/protection-bypass`, { revoke: { secret: state.bypass, regenerate: false } }); });
  if (state.adminVarChanged) await cleanup("admin e-mail list restored (disposable e-mail removed)", async () => setVar("NEXT_PUBLIC_ADMIN_EMAILS", state.adminEmailsOriginal));
  if (state.adminVarChanged) await cleanup("#123 rebuilt without the disposable e-mail (the repaired key stays)", async () => { redeploy(); });
  await cleanup("bypass secrets left on the project", async () => { const n = Object.keys(vapi("GET", `/v9/projects/${PROJECT}`).protectionBypass ?? {}).length; notes.push(`bypass secrets left: ${n}`); if (n !== 0) throw new Error(`${n} left`); });
  if (db) await cleanup("disposable accounts absent", async () => { const l = await db.auth.admin.listUsers({ perPage: 200 }); const left = (l.data?.users ?? []).filter((u) => state.ids.includes(u.id)); if (left.length) throw new Error(`${left.length} left`); });
  const md = [`# Parallax #123: repair and replay (${new Date().toISOString()})`, "", `Result: **${ok ? "PASS" : DIAG_ONLY ? "diagnosis only" : "FAIL"}**`, "", ...notes.map((n) => `- ${n}`), ""].join("\n");
  writeFileSync(path.join(WORK, "parallax-fix-report.md"), md);
  log(md);
  process.exitCode = ok ? 0 : 1;
}
