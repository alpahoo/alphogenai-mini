// Shared helpers for the staging session scripts (Vercel / Supabase / Playwright). No secret is ever printed.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { sleep } from "../avatar-local/lib.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const WORK = path.join(ROOT, "tmp/avatar-staging");
export const SHOTS = path.join(WORK, "shots");
export const TEAM = "team_kq6TRybfPHjJYkfAlQXGDpI2", PROJECT = "prj_D2woxz7R5y0hBB1pd0WQGYmWGkDV";
export const STAGING_REF = "hhearpympdflxyfmszap", PROD_REF = "qbrpzmuedfugbhoeytdj";
export const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
export const BR = { longcat: "claude/longcat-avatar-integration", cinema: "feat/cinema-m1-persistence", parallax: "codex/parallax-coexistence" };
export const WIN = process.platform === "win32";
export const log = (m) => console.log(m);
export const clean = (s) => String(s ?? "").replace(/eyJ[A-Za-z0-9_\-\.]+/g, "[jwt]").replace(/sb_(secret|publishable)_[A-Za-z0-9_\-]+/g, "[key]").slice(0, 300);
export const rand = (n) => randomBytes(n).toString("hex");
mkdirSync(SHOTS, { recursive: true });

const quote = (x) => (/[&|<>^%\s"]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x);
export function sh(cmd, args, { input, allowFail = false } = {}) {
  const useShell = WIN && ["npx", "node"].includes(cmd);
  const r = spawnSync(cmd, useShell ? args.map(quote) : args, { input, encoding: "utf8", cwd: ROOT, shell: useShell, maxBuffer: 1 << 28 });
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed (exit ${r.status}): ${clean(String(r.stderr || "").trim().split("\n").slice(-2).join(" "))}`);
  return { out: String(r.stdout || ""), err: String(r.stderr || ""), status: r.status };
}
export const vercel = (args, opts) => sh("npx", ["--yes", "vercel@latest", ...args, "--scope", TEAM], opts);
export const vapi = (method, route, body) => {
  const sep = route.includes("?") ? "&" : "?";
  const r = vercel(["api", `${route}${sep}teamId=${TEAM}`, "-X", method, ...(body ? ["--input", "-"] : []), "--raw"], { input: body ? JSON.stringify(body) : undefined });
  try { return JSON.parse(r.out); } catch { return {}; }
};
export function parseDotenv(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) { if (!line || line.startsWith("#") || !line.includes("=")) continue; const i = line.indexOf("="); map[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, ""); }
  return map;
}
export function pullBranchEnv(branch) {
  const file = path.join(WORK, `pull-${rand(4)}.env`);
  try { vercel(["env", "pull", file, "--environment=preview", `--git-branch=${branch}`, "--project", PROJECT, "--yes"]); return parseDotenv(readFileSync(file, "utf8")); }
  finally { rmSync(file, { force: true }); }
}
export const setAdminEmails = (value, branch) => vercel(["env", "add", "NEXT_PUBLIC_ADMIN_EMAILS", "preview", "--git-branch", branch, "--force", "--no-sensitive", "--project", PROJECT], { input: value });
export function stagingKeys() {
  const r = sh("npx", ["--yes", "supabase@3.2.0", "projects", "api-keys", "--project-ref", STAGING_REF, "-o", "json"]);
  const list = JSON.parse(r.out.slice(r.out.indexOf("[")));
  const pick = (n) => list.find((k) => k.name === n)?.api_key;
  const anon = pick("anon"), service = pick("service_role");
  if (!anon || !service) throw new Error("anon / service_role keys not found");
  return { anon, service };
}
export const latestDeployment = (branch) => {
  const d = vapi("GET", `/v6/deployments?projectId=${PROJECT}&limit=1&target=preview&meta-githubCommitRef=${encodeURIComponent(branch)}`).deployments?.[0];
  if (!d) throw new Error(`no Preview deployment found for ${branch}`);
  return d;
};
export async function waitLatestReady(branch, shaPrefix) {
  for (let i = 0; i < 120; i++) {
    const d = latestDeployment(branch);
    const st = d.state ?? d.readyState;
    if (["ERROR", "CANCELED"].includes(st)) throw new Error(`latest deployment of ${branch} ended ${st}`);
    if (st === "READY" && (!shaPrefix || String(d.meta?.githubCommitSha ?? "").startsWith(shaPrefix))) return d;
    await sleep(10_000);
  }
  throw new Error(`latest deployment of ${branch} not ready (or not on the expected commit) in 20 minutes`);
}
export function redeploy(branch) {
  const r = vercel(["redeploy", `https://${latestDeployment(branch).url}`, "--no-wait"]);
  const found = (r.out + r.err).match(/https:\/\/[a-z0-9-]+\.vercel\.app/g)?.pop();
  if (!found) throw new Error(`redeploy of ${branch} did not return a URL`);
  return found.replace(/^https:\/\//, "");
}
export async function waitReady(host) {
  for (let i = 0; i < 90; i++) {
    const d = vapi("GET", `/v13/deployments/${host}`);
    if (d.readyState === "READY") return;
    if (["ERROR", "CANCELED"].includes(d.readyState)) throw new Error(`deployment ${host} ended ${d.readyState}`);
    await sleep(10_000);
  }
  throw new Error(`deployment ${host} not ready in 15 minutes`);
}
export const fetcherFor = (bypass) => (base, p, init = {}) => fetch(base + p, { redirect: "manual", ...init, headers: { "x-vercel-protection-bypass": bypass, ...(init.headers ?? {}) } });
export async function bundleRefs(fetcher, base) {
  const html = await (await fetcher(base, "/login")).text();
  const chunks = [...new Set([...html.matchAll(/static\/chunks\/[A-Za-z0-9_\-\/\[\]\.%]+\.js/g)].map((m) => m[0]))];
  const refs = new Set();
  for (const m of html.matchAll(/([a-z0-9]{20})\.supabase\.co/g)) refs.add(m[1]);
  for (const c of chunks) { const t = await (await fetcher(base, `/_next/${c}`)).text(); for (const m of t.matchAll(/([a-z0-9]{20})\.supabase\.co/g)) refs.add(m[1]); }
  return { chunks: chunks.length, refs: [...refs] };
}
export async function signIn(anonKey, email, password) {
  const jar = new Map();
  const sb = createServerClient(STAGING_URL, anonKey, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error("sign-in failed for the disposable account");
  return { id: data.user.id, cookies: () => [...jar].map(([name, value]) => ({ name, value })) };
}


/** The Playwright of the repo may expect a newer Chromium than the one already installed: reuse the installed one, never download. */
export async function launchChromium() {
  const root = (process.env.LOCALAPPDATA ?? "").split(String.fromCharCode(92)).join("/") + "/ms-playwright/";
  for (const rel of ["chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe", "chromium-1208/chrome-win64/chrome.exe"]) {
    if (existsSync(root + rel)) { try { return await chromium.launch({ headless: true, executablePath: root + rel }); } catch { /* try the next one */ } }
  }
  return chromium.launch({ headless: true });
}
