// Start the AlphoGen dev server for the local Cinema M1 recipe.
//
//   node tools/cinema-local/dev.mjs                 generation locked: no COMFY_* variable, the routes answer 503
//   node tools/cinema-local/dev.mjs --simulated     SIMULATED dispatcher: a local HTTPS server stands in for Modal
//
// The simulated dispatcher never contacts Modal or any network host. It accepts POST /dispatch {run_id} (header
// x-comfy-secret), then behaves like the real executor against the LOCAL database only: claim_comfy_admin_run,
// upload a raw and a final MP4 to the local comfy-outputs bucket, insert the two comfy_assets rows and call
// finish_comfy_admin_run. The Next.js routes, the admission RPC, the gate and the outbox are the real ones.
// Control: POST /control {mode: accept | hold | reject | release}; GET /log. Both need the dispatch secret.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:https";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { ROOT, loadEnv, serviceClient } from "./lib.mjs";

const args = process.argv.slice(2);
const simulated = args.includes("--simulated");
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3000";
const env = loadEnv(); // refuses a non-local Supabase URL
const childEnv = { ...process.env };
for (const k of Object.keys(childEnv)) if (k.startsWith("COMFY_")) delete childEnv[k];

let mock = null;
if (simulated) {
  const dir = path.join(ROOT, "tmp/cinema-local/tls"); mkdirSync(dir, { recursive: true });
  const key = path.join(dir, "key.pem"), cert = path.join(dir, "cert.pem");
  if (!existsSync(key) || !existsSync(cert)) {
    const r = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", key, "-out", cert], { encoding: "utf8" });
    if (r.status !== 0) throw new Error("openssl is required to create the local self-signed certificate: " + r.stderr);
  }
  const secret = randomBytes(24).toString("hex");
  writeFileSync(path.join(ROOT, "tmp/cinema-local/dispatch-secret"), secret, { mode: 0o600 });
  const db = serviceClient(env);
  const mediaDir = path.join(ROOT, "tmp/cinema-local/media");
  const log = []; let mode = "accept"; const held = [];

  async function render(runId, entry) {
    const claimed = await db.rpc("claim_comfy_admin_run", { p_run: runId });
    if (claimed.error || claimed.data !== true) { entry.result = "claim refused"; return; }
    const { data: run } = await db.from("comfy_runs").select("user_id").eq("id", runId).single();
    for (const [role, file] of [["raw", "plan3_raw.mp4"], ["final", "plan3.mp4"]]) {
      const storageKey = `${run.user_id}/${runId}/${role}.mp4`;
      const up = await db.storage.from("comfy-outputs").upload(storageKey, readFileSync(path.join(mediaDir, file)), { contentType: "video/mp4", upsert: true });
      if (up.error) { await db.rpc("finish_comfy_admin_run", { p_run: runId, p_success: false, p_error: "UPLOAD_FAILED", p_seconds: 0 }); entry.result = "upload failed"; return; }
      await db.from("comfy_assets").insert({ run_id: runId, owner_id: run.user_id, role, storage_key: storageKey, mime: "video/mp4" });
    }
    const done = await db.rpc("finish_comfy_admin_run", { p_run: runId, p_success: true, p_error: null, p_seconds: 7.5 });
    entry.result = done.error ? "finish failed" : "done";
  }
  const readBody = (req) => new Promise((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } }); });
  mock = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, async (req, res) => {
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.headers["x-comfy-secret"] !== secret) return send(401, { error: "unauthorized" });
    if (req.method === "GET" && req.url === "/log") return send(200, { mode, held: held.length, log });
    const body = await readBody(req);
    if (req.method === "POST" && req.url === "/control") {
      if (body.mode === "release") { const items = held.splice(0); for (const it of items) await render(it.runId, it.entry); return send(200, { released: items.length }); }
      if (["accept", "hold", "reject"].includes(body.mode)) { mode = body.mode; return send(200, { mode }); }
      return send(400, { error: "bad mode" });
    }
    if (req.method === "POST" && req.url === "/dispatch" && typeof body.run_id === "string") {
      const entry = { run_id: body.run_id, at: new Date().toISOString(), mode, result: mode };
      log.push(entry);
      if (mode === "reject") return send(503, { error: "simulated outage" });
      send(200, { accepted: true });
      if (mode === "hold") held.push({ runId: body.run_id, entry }); else setTimeout(() => void render(body.run_id, entry).catch((e) => { entry.result = "error " + e.message; }), 1200);
      return;
    }
    send(404, { error: "not found" });
  });
  await new Promise((resolve) => mock.listen(8443, "127.0.0.1", resolve));
  Object.assign(childEnv, { COMFY_ADMIN_ENABLED: "true", COMFY_DISPATCH_URL: "https://127.0.0.1:8443/dispatch", COMFY_DISPATCH_SECRET: secret, NODE_EXTRA_CA_CERTS: cert });
  console.log("simulated dispatcher listening on https://127.0.0.1:8443 (local only, mode accept)");
}

console.log(`starting next dev on :${port} (generation ${simulated ? "SIMULATED" : "locked"})`);
const child = spawn("npx", ["next", "dev", "-p", port], { cwd: ROOT, env: childEnv, stdio: "inherit", shell: process.platform === "win32" });
const stop = () => { try { if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]); else child.kill("SIGTERM"); } catch { /* already gone */ } mock?.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
child.on("exit", () => { mock?.close(); process.exit(0); });
