// Runs the LongCat API checks (tools/avatar-staging/checks.mjs) against the LOCAL stack, to validate the check logic itself.
//   node tools/avatar-local/setup.mjs && node tools/avatar-local/dev.mjs --simulated   (in another terminal)
//   node tools/avatar-staging/local-selftest.mjs
import path from "node:path";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { ROOT, loadEnv, serviceClient, login, ffmpegPath, psql } from "../avatar-local/lib.mjs";
import { checksLongcat } from "./checks.mjs";
import { cleanupData } from "./cleanup.mjs";

const env = loadEnv(); const db = serviceClient(env);
const APP = process.env.AVATAR_APP_URL || "http://localhost:3000";
const media = path.join(ROOT, "tmp/avatar-staging/media"); mkdirSync(media, { recursive: true });
const ff = ffmpegPath(); const gen = (a) => { const r = spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-y", ...a]); if (r.status) throw new Error("ffmpeg"); };
gen(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=9.72", "-ac", "1", path.join(media, "good.wav")]);
gen(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=12", "-ac", "1", path.join(media, "long.mp3")]);
gen(["-f", "lavfi", "-i", "testsrc2=size=512x768", "-frames:v", "1", path.join(media, "portrait.png")]);
// a non-admin local account (not in NEXT_PUBLIC_ADMIN_EMAILS)
const email = "avatar-c@example.test", password = randomBytes(12).toString("base64url");
const existing = (await db.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === email);
if (existing) await db.auth.admin.updateUserById(existing.id, { password }); else await db.auth.admin.createUser({ email, password, email_confirm: true });
const admin = await login(env, env.LOCAL_TEST_USER_A_EMAIL, env.LOCAL_TEST_USER_A_PASSWORD), user = await login(env, email, password);
psql(`update public.comfy_runtime_gates set remaining_runs=5, budget_usd=3.75, committed_usd=0 where runtime='longcat-avatar@1';`);
const req = async (who, method, p, { json, form, headers } = {}) => {
  const h = { ...(headers ?? {}) }; if (who === "admin") h.cookie = admin.cookie(); else if (who === "user") h.cookie = user.cookie(); if (json) h["content-type"] = "application/json";
  const res = await fetch(APP + p, { method, redirect: "manual", headers: h, body: form ?? (json ? JSON.stringify(json) : undefined) });
  const text = await res.text(); let parsed = null; try { parsed = JSON.parse(text); } catch { /* */ } return { status: res.status, json: parsed, text };
};
const r = await checksLongcat({ base: (p) => APP + p, req, db, ids: { admin: admin.id, user: user.id }, media });
const ok = r.summary();
// Cleanup self-test: the same routine the hosted run uses, then deleting the disposable (non-admin) account.
const notes = await cleanupData(db, [admin.id, user.id]);
const del = await db.auth.admin.deleteUser(user.id);
const left = (await db.from("comfy_runs").select("id").eq("user_id", admin.id)).data?.length ?? 0;
const files = (await db.storage.from("references").list(admin.id)).data?.length ?? 0;
console.log(`CLEANUP notes=${JSON.stringify(notes)} deleteUser=${del.error ? "ERR " + del.error.message : "ok"} runs_left=${left} top_level_entries_left=${files}`);
process.exit(ok && !notes.length && !del.error && !left && !files ? 0 : 1);
