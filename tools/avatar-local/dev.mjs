// Start the AlphoGen dev server for the LOCAL talking-avatar rehearsal.
//
//   node tools/avatar-local/dev.mjs --simulated [--port 3000]
//
// A local HTTPS server stands in for the Modal dispatch endpoint. On POST /dispatch {run_id} (header x-comfy-secret) it
// answers 200 and runs the REAL CPU broker (modal_app/comfy/broker.py::run, see sim_run.py) against the LOCAL database.
// ONLY THE GPU is simulated (a synthetic MP4 shaped like the real output). Nothing contacts Modal or any network host.
// Control: POST /control {mode: ok | fail | slow | reject}; GET /log. Both need the dispatch secret.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:https";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { ROOT, loadEnv, ffmpegPath } from "./lib.mjs";

const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3000";
if (!args.includes("--simulated")) throw new Error("Use --simulated (this rehearsal always needs the simulated dispatcher)");
const env = loadEnv(); // refuses a non-local Supabase URL
const childEnv = { ...process.env };
for (const k of Object.keys(childEnv)) if (k.startsWith("COMFY_")) delete childEnv[k];

const dir = path.join(ROOT, "tmp/avatar-local/tls"); mkdirSync(dir, { recursive: true });
const key = path.join(dir, "key.pem"), cert = path.join(dir, "cert.pem");
if (!existsSync(key) || !existsSync(cert)) {
  const r = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", key, "-out", cert], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("openssl is required for the local self-signed certificate: " + r.stderr);
}
const secret = randomBytes(24).toString("hex");
writeFileSync(path.join(ROOT, "tmp/avatar-local/dispatch-secret"), secret, { mode: 0o600 });
const log = []; let mode = "ok";
const python = process.env.AVATAR_SIM_PYTHON || "python";
const simEnv = { ...process.env, SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY, PYTHONUTF8: "1",
  PATH: path.dirname(ffmpegPath()) + path.delimiter + process.env.PATH };

function runBroker(runId, entry) {
  // ffmpeg-static is named differently from `ffmpeg`: expose it under the name the broker calls.
  const child = spawn(python, [path.join(ROOT, "tools/avatar-local/sim_run.py"), runId, entry.mode], { cwd: ROOT, env: simEnv });
  let out = ""; child.stdout.on("data", (c) => (out += c)); child.stderr.on("data", (c) => (out += c));
  child.on("exit", (code) => { entry.exit = code; entry.gpu = out.includes("SIM_GPU_CALL"); entry.output =out.trim().split("\n").slice(-3).join(" | "); });
}
const readBody = (req) => new Promise((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } }); });
const mock = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.headers["x-comfy-secret"] !== secret) return send(401, { error: "unauthorized" });
  if (req.method === "GET" && req.url === "/log") return send(200, { mode, log });
  const body = await readBody(req);
  if (req.method === "POST" && req.url === "/control") {
    if (["ok", "fail", "slow", "reject"].includes(body.mode)) { mode = body.mode; return send(200, { mode }); }
    return send(400, { error: "bad mode" });
  }
  if (req.method === "POST" && req.url === "/dispatch" && typeof body.run_id === "string") {
    const entry = { run_id: body.run_id, at: new Date().toISOString(), mode };
    log.push(entry);
    if (mode === "reject") return send(503, { error: "simulated outage" });
    send(200, { accepted: true });
    runBroker(body.run_id, entry);
    return;
  }
  send(404, { error: "not found" });
});
await new Promise((resolve) => mock.listen(8443, "127.0.0.1", resolve));
Object.assign(childEnv, { COMFY_LONGCAT_ENABLED: "true", COMFY_DISPATCH_URL: "https://127.0.0.1:8443/dispatch", COMFY_DISPATCH_SECRET: secret, NODE_EXTRA_CA_CERTS: cert });
console.log("simulated dispatcher listening on https://127.0.0.1:8443 (local only, GPU simulated, real broker)");
console.log(`starting next dev on :${port}`);
const child = spawn("npx", ["next", "dev", "-p", port], { cwd: ROOT, env: childEnv, stdio: "inherit", shell: process.platform === "win32" });
const stop = () => { try { if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]); else child.kill("SIGTERM"); } catch { /* gone */ } mock.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
child.on("exit", () => { mock.close(); process.exit(0); });
