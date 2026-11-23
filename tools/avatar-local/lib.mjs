// Helpers for the LOCAL talking-avatar rehearsal. Every helper refuses a non-local Supabase URL.
// No secret is ever printed; keys live in the git-ignored .env.local. Adapted from tools/cinema-local (PR #119).
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const APP = process.env.AVATAR_APP_URL || "http://localhost:3000";
const require = createRequire(import.meta.url);

export function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) throw new Error(".env.local not found. Run: node tools/avatar-local/setup.mjs");
  const env = Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
  assertLocal(env.NEXT_PUBLIC_SUPABASE_URL);
  return env;
}
export function assertLocal(url) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(String(url))) throw new Error("Refusing to run: the Supabase URL is not a local stack (" + url + ")");
}
export const serviceClient = (env) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const ffmpegPath = () => require("ffmpeg-static");

export function dbContainer() {
  if (process.env.SUPABASE_DB_CONTAINER) return process.env.SUPABASE_DB_CONTAINER;
  const out = spawnSync("docker", ["ps", "--format", "{{.Names}}", "--filter", "name=^supabase_db_alphogenai-longcat-int"], { encoding: "utf8" });
  const names = String(out.stdout).split(/\r?\n/).filter(Boolean);
  if (names.length !== 1) throw new Error("Expected the supabase_db_alphogenai-longcat-int container, found " + names.length);
  return names[0];
}
/** Run SQL on the local database as postgres. Never throws on SQL errors. */
export function psql(sql, { file } = {}) {
  const r = spawnSync("docker", ["exec", "-i", dbContainer(), "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-1", "-At", "-q"],
    { input: file ? readFileSync(file) : sql, encoding: "utf8", maxBuffer: 1 << 26 });
  const err = String(r.stderr || "").replace(/\r/g, "");
  return { ok: r.status === 0, stdout: String(r.stdout || "").replace(/\r/g, "").trim(), error: err.split("\n").filter((l) => /ERROR|FATAL/.test(l))[0] || (r.status === 0 ? "" : err.trim().split("\n")[0]) };
}

export async function login(env, email, password) {
  const jar = new Map();
  const sb = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error("login failed for " + email + ": " + error.message);
  return { id: data.user.id, email, cookie: () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}
export async function call(user, method, route, body, form) {
  const res = await fetch(APP + route, {
    method, redirect: "manual",
    headers: { ...(user ? { Cookie: user.cookie() } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  let json = null; try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}

export function recorder(title) {
  const results = [];
  console.log("\n== " + title);
  return {
    results,
    check(name, pass, detail = "") { results.push({ name, pass: !!pass }); console.log((pass ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : "")); return !!pass; },
    note(name, detail) { console.log("NOTE " + name + "  [" + detail + "]"); },
    summary() {
      const failed = results.filter((r) => !r.pass);
      console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed` + (failed.length ? "; FAILED: " + failed.map((f) => f.name).join(" | ") : ""));
      return failed.length === 0;
    },
  };
}
export const hex = (s) => Buffer.from(s, "utf8").toString("hex");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
