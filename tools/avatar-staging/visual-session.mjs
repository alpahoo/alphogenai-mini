// Visual recipe session for #119 (Cinema), #123 (Parallax) and #125 (LongCat avatar) on the STAGING Previews.
// No password is ever typed by a human: this script creates ONE disposable admin account on staging, signs it in through the API,
// and hands the resulting session cookies to a Playwright Chromium (nothing is printed or written to disk). Previews are
// SSO-protected, so a TEMPORARY Protection Bypass for Automation secret is created and revoked at the end.
//
//     node tools/avatar-staging/visual-session.mjs
//
// Scope: Preview variables of the three branches (NEXT_PUBLIC_ADMIN_EMAILS only, restored at the end), the staging project
// hhearpympdflxyfmszap, the LongCat gate (simulated worker, no GPU: 5 runs, 3.75 USD application budget, 3 hours).
// Existing accounts and production are never touched. Cleanup always runs.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright";
import { sleep } from "../avatar-local/lib.mjs";
import { cleanupData } from "./cleanup.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = path.join(ROOT, "tmp/avatar-staging");
const SHOTS = path.join(WORK, "shots");
const TEAM = "team_kq6TRybfPHjJYkfAlQXGDpI2", PROJECT = "prj_D2woxz7R5y0hBB1pd0WQGYmWGkDV";
const STAGING_REF = "hhearpympdflxyfmszap", PROD_REF = "qbrpzmuedfugbhoeytdj";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BR = { longcat: "claude/longcat-avatar-integration", cinema: "feat/cinema-m1-persistence", parallax: "codex/parallax-coexistence" };
const WIN = process.platform === "win32";
const log = (m) => console.log(m);
const clean = (s) => String(s ?? "").replace(/eyJ[A-Za-z0-9_\-\.]+/g, "[jwt]").replace(/sb_(secret|publishable)_[A-Za-z0-9_\-]+/g, "[key]").slice(0, 300);
const rand = (n) => randomBytes(n).toString("hex");
mkdirSync(SHOTS, { recursive: true });

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
function pullBranchEnv(branch) {
  const file = path.join(WORK, `pull-${rand(4)}.env`);
  try { vercel(["env", "pull", file, "--environment=preview", `--git-branch=${branch}`, "--project", PROJECT, "--yes"]); return parseDotenv(readFileSync(file, "utf8")); }
  finally { rmSync(file, { force: true }); }
}
const setAdminEmails = (value, branch) => vercel(["env", "add", "NEXT_PUBLIC_ADMIN_EMAILS", "preview", "--git-branch", branch, "--force", "--no-sensitive", "--project", PROJECT], { input: value });
function stagingKeys() {
  const r = sh("npx", ["--yes", "supabase@3.2.0", "projects", "api-keys", "--project-ref", STAGING_REF, "-o", "json"]);
  const list = JSON.parse(r.out.slice(r.out.indexOf("[")));
  const pick = (n) => list.find((k) => k.name === n)?.api_key;
  const anon = pick("anon"), service = pick("service_role");
  if (!anon || !service) throw new Error("anon / service_role keys not found");
  return { anon, service };
}
const latestDeployment = (branch) => {
  const d = vapi("GET", `/v6/deployments?projectId=${PROJECT}&limit=1&target=preview&meta-githubCommitRef=${encodeURIComponent(branch)}`).deployments?.[0];
  if (!d) throw new Error(`no Preview deployment found for ${branch}`);
  return d;
};
async function waitLatestReady(branch, shaPrefix) {
  for (let i = 0; i < 120; i++) {
    const d = latestDeployment(branch);
    const st = d.state ?? d.readyState;
    if (["ERROR", "CANCELED"].includes(st)) throw new Error(`latest deployment of ${branch} ended ${st}`);
    if (st === "READY" && (!shaPrefix || String(d.meta?.githubCommitSha ?? "").startsWith(shaPrefix))) return d;
    await sleep(10_000);
  }
  throw new Error(`latest deployment of ${branch} not ready (or not on the expected commit) in 20 minutes`);
}
function redeploy(branch) {
  const r = vercel(["redeploy", `https://${latestDeployment(branch).url}`, "--no-wait"]);
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
const fetcherFor = (bypass) => (base, p, init = {}) => fetch(base + p, { redirect: "manual", ...init, headers: { "x-vercel-protection-bypass": bypass, ...(init.headers ?? {}) } });
async function bundleRefs(fetcher, base) {
  const html = await (await fetcher(base, "/login")).text();
  const chunks = [...new Set([...html.matchAll(/static\/chunks\/[A-Za-z0-9_\-\/\[\]\.%]+\.js/g)].map((m) => m[0]))];
  const refs = new Set();
  for (const m of html.matchAll(/([a-z0-9]{20})\.supabase\.co/g)) refs.add(m[1]);
  for (const c of chunks) { const t = await (await fetcher(base, `/_next/${c}`)).text(); for (const m of t.matchAll(/([a-z0-9]{20})\.supabase\.co/g)) refs.add(m[1]); }
  return { chunks: chunks.length, refs: [...refs] };
}
async function signIn(anonKey, email, password) {
  const jar = new Map();
  const sb = createServerClient(STAGING_URL, anonKey, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error("sign-in failed for the disposable account");
  return { id: data.user.id, cookies: () => [...jar].map(([name, value]) => ({ name, value })) };
}

// ------------------------------------------------------------------------------------------------------------------
const results = [], shots = [], notes = [], consoleIssues = [];
const rec = (pr, name, pass, detail = "") => { results.push({ pr, name, pass: !!pass, detail: clean(detail) }); log(`   ${pass ? "PASS" : "FAIL"} [${pr}] ${name}${detail && !pass ? ` (${clean(detail)})` : ""}`); };
const state = { ids: [], bypass: null, originals: {}, changed: [], gateOpened: false, hosts: {} };
let db = null, keys = null, browser = null;

const VIEWPORTS = { mobile: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, desktop: { viewport: { width: 1366, height: 850 }, deviceScaleFactor: 1 } };
const SCHEMES = ["light", "dark"];
const combos = () => Object.keys(VIEWPORTS).flatMap((vp) => SCHEMES.map((scheme) => ({ vp, scheme, key: `${vp}-${scheme}` })));

try {
  log("1/9 staging keys (in memory)");
  keys = stagingKeys();
  db = createClient(STAGING_URL, keys.service, { auth: { persistSession: false } });
  if ((await db.auth.admin.listUsers({ perPage: 1 })).error) throw new Error("the staging service key does not work");
  const head = sh("git", ["rev-parse", "HEAD"]).out.trim().slice(0, 7);

  log("2/9 read Preview variables (no write yet)");
  for (const b of Object.values(BR)) {
    const e = pullBranchEnv(b);
    if (!e.NEXT_PUBLIC_ADMIN_EMAILS || e.NEXT_PUBLIC_ADMIN_EMAILS.includes("…")) throw new Error(`branch ${b}: admin e-mails not readable; nothing changed`);
    if (e.NEXT_PUBLIC_SUPABASE_URL !== STAGING_URL) throw new Error(`branch ${b}: NEXT_PUBLIC_SUPABASE_URL is not the staging project; nothing changed`);
    if (b === BR.longcat && (e.COMFY_LONGCAT_ENABLED !== "true" || !e.COMFY_DISPATCH_URL)) throw new Error("the #125 Preview has no LongCat staging variables; run run-hosted-staging.mjs first. Nothing changed");
    state.originals[b] = e.NEXT_PUBLIC_ADMIN_EMAILS;
  }
  // Wait for the build of the commit being tested (#125 must contain the delete fix).
  const d125 = await waitLatestReady(BR.longcat, head);
  notes.push(`#125 Preview commit ${String(d125.meta?.githubCommitSha).slice(0, 7)}`);

  log("3/9 disposable admin account");
  const email = `avatar-visual-${rand(3)}@example.com`, password = randomBytes(18).toString("base64url");
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error("could not create the disposable account");
  const uid = created.data.user.id; state.ids.push(uid);
  await db.from("profiles").update({ plan: "premium" }).eq("id", uid);

  log("4/9 temporary bypass, admin e-mail on the three Preview branches, redeploy");
  const bypassSecret = randomBytes(16).toString("hex");
  vapi("PATCH", `/v1/projects/${PROJECT}/protection-bypass`, { generate: { secret: bypassSecret, note: "visual recipe (temporary)" } });
  state.bypass = bypassSecret;
  if (!Object.keys(vapi("GET", `/v9/projects/${PROJECT}`).protectionBypass ?? {}).includes(bypassSecret)) throw new Error("temporary bypass could not be created; nothing else changed");
  for (const b of Object.values(BR)) { setAdminEmails(`${state.originals[b]},${email}`, b); state.changed.push(b); }
  for (const [k, b] of Object.entries(BR)) state.hosts[k] = redeploy(b);
  for (const h of Object.values(state.hosts)) await waitReady(h);
  const fetcher = fetcherFor(state.bypass);
  for (const [k, h] of Object.entries(state.hosts)) {
    const { chunks, refs } = await bundleRefs(fetcher, `https://${h}`);
    notes.push(`Preview ${k}: ${chunks} chunks, project ids in the bundle: ${refs.join(",") || "none"}`);
    if (!refs.includes(STAGING_REF) || refs.some((x) => x !== STAGING_REF) || refs.includes(PROD_REF)) throw new Error(`SAFETY STOP: Preview ${k} does not target the staging project only (${refs.join(",") || "none"}). No authenticated call was made.`);
  }
  log("   OK: the three Previews target the staging project only.");

  log("5/9 gate (simulated worker, no GPU) and fixtures");
  const g = await db.from("comfy_runtime_gates").update({ enabled: true, licence_confirmed_at: new Date().toISOString(), allowed_user_id: uid, expires_at: new Date(Date.now() + 3 * 3600_000).toISOString(), remaining_runs: 5, budget_usd: 3.75, committed_usd: 0 }).eq("runtime", "longcat-avatar@1");
  if (g.error) throw new Error("could not open the gate");
  state.gateOpened = true;
  const media = path.join(WORK, "media"); mkdirSync(media, { recursive: true });
  const ff = createRequire(import.meta.url)("ffmpeg-static");
  const gen = (args) => sh(ff, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  gen(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=9.72", "-ac", "1", path.join(media, "good.wav")]);
  gen(["-f", "lavfi", "-i", "testsrc2=size=512x768", "-frames:v", "1", path.join(media, "portrait.png")]);
  const sess = await signIn(keys.anon, email, password);
  const cookieHeader = sess.cookies().map((c) => `${c.name}=${c.value}`).join("; ");
  const api = async (branchKey, method, p, json) => {
    const res = await fetcher(`https://${state.hosts[branchKey]}`, p, { method, headers: { cookie: cookieHeader, ...(json ? { "content-type": "application/json" } : {}) }, body: json ? JSON.stringify(json) : undefined });
    const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json: j };
  };
  // Cinema: one project / scene / shot for the admin (no generation).
  const cin = "/api/admin/studio/cinema";
  const pj = await api("cinema", "POST", cin, { action: "project.create", title: "Visual recipe project" });
  const sc = pj.json?.project?.id ? await api("cinema", "POST", cin, { action: "scene.create", project_id: pj.json.project.id, title: "Scene A" }) : null;
  if (sc?.json?.scene?.id) await api("cinema", "POST", cin, { action: "shot.create", project_id: pj.json.project.id, scene_id: sc.json.scene.id, description: "Wide shot of a studio, slow push-in" });
  rec("cinema", "fixtures: project, scene and shot created for the disposable admin", !!sc?.json?.scene?.id, `${pj.status}`);

  log("6/9 browser session");
  browser = await chromium.launch({ headless: true });
  const ctxs = new Map();
  const getPage = async (branchKey, combo) => {
    const id = `${branchKey}/${combo.key}`;
    if (ctxs.has(id)) return ctxs.get(id);
    const base = `https://${state.hosts[branchKey]}`;
    const context = await browser.newContext({ ...VIEWPORTS[combo.vp], colorScheme: combo.scheme, acceptDownloads: true });
    await context.addInitScript((scheme) => { try { localStorage.setItem("theme", scheme); } catch { /* storage blocked */ } }, combo.scheme);
    const page = await context.newPage();
    const issues = [];
    page.on("pageerror", (e) => issues.push(`pageerror: ${clean(e.message)}`));
    page.on("console", (m) => { if (m.type() === "error") issues.push(`console: ${clean(m.text())}`); });
    page.on("response", (r) => { const u = new URL(r.url()); if (u.origin === base && r.status() >= 400 && !/favicon/.test(u.pathname)) issues.push(`http ${r.status()} ${u.pathname}`); });
    await page.goto(`${base}/login?x-vercel-protection-bypass=${state.bypass}&x-vercel-set-bypass-cookie=true`, { waitUntil: "domcontentloaded" });
    await context.addCookies(sess.cookies().map((c) => ({ name: c.name, value: c.value, url: base })));
    page.on("dialog", (d) => void d.accept());
    const entry = { page, context, base, issues, combo };
    ctxs.set(id, entry);
    return entry;
  };
  const shoot = async (branchKey, combo, name, { full = true } = {}) => {
    const e = await getPage(branchKey, combo);
    const file = path.join(SHOTS, `${branchKey}__${name}__${combo.key}.png`);
    await e.page.waitForTimeout(600);
    await e.page.screenshot({ path: file, fullPage: full && combo.vp === "mobile" ? true : false });
    const m = await e.page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, dark: document.documentElement.classList.contains("dark"), title: document.title, h1: document.querySelector("h1")?.textContent?.slice(0, 60) ?? "" }));
    shots.push({ branchKey, name, combo, file, ...m });
    rec(branchKey, `${name} @ ${combo.key}: no horizontal scroll`, m.over <= 1, `overflow ${m.over}px`);
    rec(branchKey, `${name} @ ${combo.key}: theme class matches (${combo.scheme})`, m.dark === (combo.scheme === "dark"), `dark=${m.dark}`);
    return e;
  };
  const open = async (branchKey, combo, p) => {
    const e = await getPage(branchKey, combo);
    const res = await e.page.goto(`${e.base}${p}`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
    return { e, status: res?.status() ?? 0 };
  };
  const [DL, DD, ML, MD] = [combos().find((c) => c.key === "desktop-light"), combos().find((c) => c.key === "desktop-dark"), combos().find((c) => c.key === "mobile-light"), combos().find((c) => c.key === "mobile-dark")];

  log("7/9 #125 talking avatar");
  {
    const A = "/admin/studio/avatar";
    let { e, status } = await open("longcat", DL, A);
    rec("longcat", "page opens (200, no redirect to /login)", status === 200 && e.page.url().includes("/admin/studio/avatar"), `${status} ${e.page.url().replace(e.base, "")}`);
    await shoot("longcat", DL, "avatar-empty");
    await e.page.setInputFiles('input[aria-label="Portrait file"]', path.join(media, "portrait.png"));
    await e.page.fill('input[aria-label="Portrait name"]', "Visual portrait");
    await e.page.getByRole("button", { name: "Add" }).first().click();
    await e.page.getByRole("radio", { name: /Visual portrait/ }).waitFor({ timeout: 30_000 }).then(() => rec("longcat", "portrait upload through the UI selects it", true), () => rec("longcat", "portrait upload through the UI selects it", false));
    await e.page.setInputFiles('input[aria-label="Audio file"]', path.join(media, "good.wav"));
    await e.page.fill('input[aria-label="Audio name"]', "Visual voice");
    await e.page.getByRole("button", { name: "Add" }).nth(1).click();
    await e.page.getByRole("radio", { name: /Visual voice/ }).waitFor({ timeout: 30_000 }).then(() => rec("longcat", "audio upload through the UI lists it", true), () => rec("longcat", "audio upload through the UI lists it", false));
    const r = await e.page.getByRole("radio", { name: /Visual voice/ }).count() ? e.page.getByRole("radio", { name: /Visual voice/ }) : null;
    if (r) await r.click();
    await shoot("longcat", DL, "avatar-ready");
    const renderBtn = e.page.getByRole("button", { name: /Render avatar/ });
    rec("longcat", "Render button is enabled once a portrait and an audio are chosen", await renderBtn.isEnabled());
    await renderBtn.click();
    await e.page.waitForTimeout(1500);
    await shoot("longcat", DL, "avatar-rendering", { full: false });
    await e.page.waitForSelector("video", { timeout: 8 * 60_000 }).then(() => rec("longcat", "the render finishes and the private video player appears", true), () => rec("longcat", "the render finishes and the private video player appears", false, "no video in 8 min"));
    await e.page.waitForTimeout(1500);
    const dl = e.page.getByRole("button", { name: /Download MP4/ });
    rec("longcat", "Download MP4 and Delete render buttons are visible", (await dl.count()) > 0 && (await e.page.getByRole("button", { name: /Delete render/ }).count()) > 0);
    const [download] = await Promise.all([e.page.waitForEvent("download", { timeout: 30_000 }).catch(() => null), dl.click().catch(() => null)]);
    rec("longcat", "the MP4 downloads from the button", !!download, download ? download.suggestedFilename() : "no download event");
    await shoot("longcat", DL, "avatar-done");
    await e.page.reload({ waitUntil: "networkidle" });
    rec("longcat", "after a reload the render is in the Library", (await e.page.locator("#hist-h").locator("xpath=..").locator("li").count()) >= 1);
    await shoot("longcat", DL, "avatar-reload");
    // Other themes / viewports: open the same render from the Library.
    for (const c of [DD, ML, MD]) {
      const o = await open("longcat", c, A);
      rec("longcat", `page opens @ ${c.key}`, o.status === 200, String(o.status));
      await o.e.page.locator("#hist-h").locator("xpath=..").locator("li button").first().click().catch(() => {});
      await o.e.page.waitForSelector("video", { timeout: 60_000 }).catch(() => {});
      await shoot("longcat", c, "avatar-done");
    }
  }

  log("8/9 #119 Cinema and #123 Parallax");
  {
    for (const c of combos()) {
      const o = await open("cinema", c, "/admin/studio");
      rec("cinema", `/admin/studio opens @ ${c.key}`, o.status === 200 && o.e.page.url().includes("/admin/studio"), `${o.status}`);
      await shoot("cinema", c, "studio-home");
      const tab = o.e.page.getByRole("button", { name: /cinema/i }).first();
      const link = o.e.page.getByRole("link", { name: /cinema/i }).first();
      const entry = (await tab.count()) ? tab : (await link.count()) ? link : null;
      if (entry) {
        await entry.click().catch(() => {}); await o.e.page.waitForTimeout(1500);
        await shoot("cinema", c, "cinema-view");
        const proj = o.e.page.getByText("Visual recipe project").first();
        if (await proj.count()) { await proj.click().catch(() => {}); await o.e.page.waitForTimeout(1500); await shoot("cinema", c, "cinema-storyboard"); }
        else notes.push(`cinema @ ${c.key}: project card not found by text`);
      } else notes.push(`cinema @ ${c.key}: no control named Cinema found in /admin/studio`);
    }
    // Parallax: modules off (default), then on.
    for (const c of combos()) {
      const o = await open("parallax", c, "/admin/modules");
      rec("parallax", `/admin/modules opens @ ${c.key}`, o.status === 200 && o.e.page.url().includes("/admin/modules"), `${o.status}`);
      await shoot("parallax", c, "modules-default");
      for (const p of ["/parallax/shorts", "/parallax/audio", "/remix"]) {
        const x = await open("parallax", c, p);
        if (c.key === "desktop-light") notes.push(`parallax OFF ${p}: HTTP ${x.status}`);
        await shoot("parallax", c, `off${p.replace(/\//g, "-")}`, { full: false });
      }
    }
    {
      const o = await open("parallax", DL, "/admin/modules");
      const sw = o.e.page.getByRole("switch");
      const n = await sw.count();
      rec("parallax", "the modules screen shows the switches", n >= 3, `${n} switch(es)`);
      if (n) {
        const before = await sw.first().getAttribute("aria-checked");
        await sw.first().click(); await o.e.page.waitForTimeout(1500);
        await o.e.page.reload({ waitUntil: "networkidle" });
        const after = await o.e.page.getByRole("switch").first().getAttribute("aria-checked");
        rec("parallax", "a switch saved from the UI survives a reload", before !== after, `${before} -> ${after}`);
      }
    }
    for (const id of ["parallax_shorts", "parallax_audio", "parallax_remix"]) await api("parallax", "PATCH", "/api/admin/modules", { module: id, enabled: true });
    for (const c of combos()) {
      await open("parallax", c, "/admin/modules");
      await shoot("parallax", c, "modules-on");
      for (const p of ["/parallax/shorts", "/parallax/audio", "/remix"]) {
        const x = await open("parallax", c, p);
        rec("parallax", `${p} opens when its module is on @ ${c.key}`, x.status === 200, String(x.status));
        await shoot("parallax", c, `on${p.replace(/\//g, "-")}`);
      }
    }
  }

  log("9/9 #125 delete from the UI (mobile, dark)");
  {
    const o = await open("longcat", MD, "/admin/studio/avatar");
    await o.e.page.locator("#hist-h").locator("xpath=..").locator("li button").first().click().catch(() => {});
    await o.e.page.waitForSelector("video", { timeout: 60_000 }).catch(() => {});
    const runRow = (await db.from("comfy_runs").select("id,job_id").eq("user_id", uid).order("created_at", { ascending: false }).limit(1)).data?.[0];
    await o.e.page.getByRole("button", { name: /Delete render/ }).click();
    await o.e.page.getByText("Render deleted.").waitFor({ timeout: 30_000 }).then(() => rec("longcat", "deleting from the UI answers \"Render deleted.\" (no 503)", true), () => rec("longcat", "deleting from the UI answers \"Render deleted.\" (no 503)", false));
    await shoot("longcat", MD, "avatar-deleted");
    await o.e.page.reload({ waitUntil: "networkidle" });
    rec("longcat", "after a reload the Library no longer lists it", (await o.e.page.getByText("No avatar render yet.").count()) === 1);
    if (runRow) {
      const job = (await db.from("jobs").select("prompt").eq("id", runRow.job_id).maybeSingle()).data;
      rec("longcat", "database: the job row stays and its prompt is [deleted]", job?.prompt === "[deleted]", String(job?.prompt).slice(0, 20));
      rec("longcat", "database: no asset record is left for the run", ((await db.from("comfy_assets").select("id").eq("run_id", runRow.id)).data?.length ?? 1) === 0);
    }
  }
  for (const [id, e] of ctxs) if (e.issues.length) consoleIssues.push(`${id}: ${[...new Set(e.issues)].slice(0, 6).join(" | ")}`);
} catch (e) {
  notes.push(`STOPPED: ${clean(e.message)}`); log(`STOPPED: ${clean(e.message)}`);
} finally {
  log("cleanup (always)");
  try { await browser?.close(); } catch { /* closed */ }
  const cleanup = async (name, fn) => { try { await fn(); notes.push(`cleanup ok: ${name}`); } catch (e) { notes.push(`cleanup FAILED: ${name} (${clean(e.message)})`); } };
  if (db) {
    await cleanup("gate closed", async () => { const r = await db.from("comfy_runtime_gates").update({ enabled: false, licence_confirmed_at: null, allowed_user_id: null, expires_at: null, remaining_runs: 0, budget_usd: 0, committed_usd: 0 }).eq("runtime", "longcat-avatar@1"); if (r.error) throw r.error; });
    await cleanup("test module flag emptied", async () => { await db.from("app_settings").delete().eq("key", "parallax_modules"); });
    if (state.ids.length) {
      await cleanup("rows and files of the disposable account", async () => { const n = await cleanupData(db, state.ids); if (n.length) throw new Error(n.join("; ")); });
      for (const id of state.ids) await cleanup(`account ${id.slice(0, 8)} deleted`, async () => { const r = await db.auth.admin.deleteUser(id); if (r.error) throw r.error; });
    }
  }
  if (state.bypass) await cleanup("temporary protection bypass revoked", async () => { vapi("PATCH", `/v1/projects/${PROJECT}/protection-bypass`, { revoke: { secret: state.bypass, regenerate: false } }); });
  for (const b of state.changed) await cleanup(`admin e-mail list restored on ${b}`, async () => setAdminEmails(state.originals[b], b));
  if (state.changed.length) await cleanup("the three Previews rebuilt without the disposable e-mail", async () => { for (const b of Object.values(BR)) redeploy(b); });
  await cleanup("no bypass secret left on the project", async () => { const n = Object.keys(vapi("GET", `/v9/projects/${PROJECT}`).protectionBypass ?? {}).length; notes.push(`bypass secrets left: ${n}`); if (n !== 0) throw new Error(`${n} left`); });
  if (db && state.ids.length) await cleanup("disposable account absent", async () => { const l = await db.auth.admin.listUsers({ perPage: 200 }); if ((l.data?.users ?? []).some((u) => state.ids.includes(u.id))) throw new Error("still exists"); });

  // Contact sheets: one PNG per page, desktop light|dark on top, mobile light|dark below.
  try {
    const names = [...new Set(shots.map((s) => `${s.branchKey}__${s.name}`))];
    const b2 = await chromium.launch({ headless: true });
    for (const n of names) {
      const get = (k) => { const s = shots.find((x) => `${x.branchKey}__${x.name}` === n && x.combo.key === k); return s && existsSync(s.file) ? `data:image/png;base64,${readFileSync(s.file).toString("base64")}` : null; };
      const cell = (k, w) => { const d = get(k); return `<figure style="margin:0"><figcaption style="font:12px sans-serif;color:#555">${k}</figcaption>${d ? `<img src="${d}" style="width:${w}px;max-height:1500px;object-fit:cover;object-position:top;border:1px solid #888">` : `<div style="width:${w}px;height:80px;border:1px dashed #888;font:12px sans-serif">missing</div>`}</figure>`; };
      const html = `<body style="margin:12px;background:#ddd"><div style="display:flex;gap:12px">${cell("desktop-light", 683)}${cell("desktop-dark", 683)}</div><div style="display:flex;gap:12px;margin-top:12px">${cell("mobile-light", 375)}${cell("mobile-dark", 375)}</div></body>`;
      const pg = await b2.newPage({ viewport: { width: 1420, height: 900 } });
      await pg.setContent(html); await pg.waitForTimeout(300);
      await pg.screenshot({ path: path.join(SHOTS, `sheet__${n}.png`), fullPage: true });
      await pg.close();
    }
    await b2.close();
  } catch (e) { notes.push(`contact sheets failed: ${clean(e.message)}`); }

  const pass = results.filter((r) => r.pass).length;
  const md = [`# Visual recipe session (${new Date().toISOString()})`, "", `Automated assertions: **${pass}/${results.length}** pass.`, "",
    "## Assertions", ...results.map((r) => `- ${r.pass ? "PASS" : "FAIL"} [${r.pr}] ${r.name}${r.pass || !r.detail ? "" : ` (${r.detail})`}`), "",
    "## Notes and cleanup", ...notes.map((n) => `- ${n}`), "", "## Browser console / HTTP issues seen (per context)", ...(consoleIssues.length ? consoleIssues.map((c) => `- ${c}`) : ["- none"]), "",
    "## Contact sheets", ...[...new Set(shots.map((s) => `${s.branchKey}__${s.name}`))].map((n) => `- tmp/avatar-staging/shots/sheet__${n}.png`), ""].join("\n");
  writeFileSync(path.join(WORK, "visual-report.md"), md);
  log(md.split("\n").slice(0, 8).join("\n"));
  log("done. Report: tmp/avatar-staging/visual-report.md");
  process.exitCode = results.every((r) => r.pass) && !notes.some((n) => /FAILED|STOPPED/.test(n)) ? 0 : 1;
}
