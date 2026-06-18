#!/usr/bin/env node
/**
 * Explainer render service (POC) — VPS, CPU-only, ~0$ marginal.
 *
 * POST /api/render  (Bearer EXPLAINER_RENDER_TOKEN)
 *   body: { storyboard: { meta:{brand}, scenes:[...] }, product_url?, voice? }
 *   -> 200 video/mp4 (the rendered explainer, voice baked in)
 *
 * Pipeline per request (serialised, concurrency = 1 to respect VPS RAM):
 *   product screenshot (chromium) -> Kokoro TTS per scene -> build composition
 *   -> hyperframes render -> return MP4 bytes.
 *
 * No R2/Supabase creds here: the caller (Next.js admin route / script) owns
 * upload + DB. Keeps secrets off the shared VPS.
 */
import express from "express";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = process.env.PORT || 9100;
const TOKEN = process.env.EXPLAINER_RENDER_TOKEN || "";
const VOICE_DEFAULT = process.env.EXPLAINER_VOICE || "af_heart";
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 600000);

// ---- serial queue (concurrency 1) -----------------------------------------
let chain = Promise.resolve();
function enqueue(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.stdout.on("data", () => {});
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} timed out`));
    }, RENDER_TIMEOUT_MS);
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-500)}`));
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function renderJob({ storyboard, product_url, voice }) {
  const work = await mkdtemp(join(tmpdir(), "exp-"));
  try {
    await mkdir(join(work, "assets"), { recursive: true });
    await writeFile(join(work, "storyboard.json"), JSON.stringify(storyboard));

    // 1. product screenshot (best-effort)
    if (product_url && /^https?:\/\//.test(product_url)) {
      try {
        await sh("chromium", [
          "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
          "--window-size=1440,900", "--virtual-time-budget=9000",
          `--screenshot=${join(work, "assets", "shot.png")}`, product_url,
        ]);
      } catch (e) {
        console.warn("[render] screenshot failed (continuing):", e.message);
      }
    }

    // 2. Kokoro TTS per scene -> assets/vo-*.wav + audio-manifest.json
    await sh("python3", ["/app/tts_kokoro.py", join(work, "storyboard.json"), join(work, "assets"), voice || VOICE_DEFAULT]);

    // 3. build composition into the work dir (auto-detects shot.png + audio manifest)
    await sh("node", ["/app/build.js", join(work, "storyboard.json"), work]);

    // 4. render -> renders/*.mp4
    await sh("npx", ["--yes", "hyperframes@0.6.110", "render"], { cwd: work });

    const renders = (await readdir(join(work, "renders"))).filter((f) => f.endsWith(".mp4"));
    if (!renders.length) throw new Error("no mp4 produced");
    return await readFile(join(work, "renders", renders[renders.length - 1]));
  } finally {
    rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

// ---- http -----------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, queueBusy: chain !== Promise.resolve() }));

app.post("/api/render", async (req, res) => {
  const auth = req.headers.authorization || "";
  const tok = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!TOKEN || tok !== TOKEN) return res.status(401).json({ error: "unauthorized" });

  const { storyboard, product_url, voice } = req.body || {};
  if (!storyboard || !Array.isArray(storyboard.scenes) || storyboard.scenes.length === 0) {
    return res.status(400).json({ error: "storyboard.scenes required" });
  }

  try {
    const t0 = Date.now();
    const mp4 = await enqueue(() => renderJob({ storyboard, product_url, voice }));
    console.log(`[render] done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(mp4.length / 1e6).toFixed(1)}MB`);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("X-Render-Seconds", ((Date.now() - t0) / 1000).toFixed(1));
    res.send(mp4);
  } catch (e) {
    console.error("[render] failed:", e.message);
    res.status(500).json({ error: String(e.message || e).slice(0, 500) });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`[explainer-renderer] listening on :${PORT}`));
