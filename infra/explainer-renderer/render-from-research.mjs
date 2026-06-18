#!/usr/bin/env node
/**
 * B4 — Admin script: render an explainer MP4 from a real research job.
 *
 * Runs OUTSIDE Vercel (no 60s timeout). Reads ALL secrets from process.env
 * (set them yourself; this script never embeds keys). Steps:
 *   1. fetch research_jobs + latest research_storyboards.scenes_json (Supabase)
 *   2. map CinematicScenePlan[] -> explainer template scenes + derive brand
 *   3. POST to the explainer render service (VPS) -> MP4 bytes
 *   4. upload MP4 to R2 -> public URL (printed)
 *
 * Usage:
 *   node --env-file=.env.local infra/explainer-renderer/render-from-research.mjs <research_job_id> [brand.json]
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   EXPLAINER_RENDER_GATEWAY_URL   (e.g. https://research-gw.alphogen.com)
 *   EXPLAINER_RENDER_TOKEN
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// --- brand derivation (research storyboards carry no brand block) ----------
const DEFAULT_BRAND = { primary: "#10131a", accent: "#6ee7b7", font: "Inter" };
function deriveBrand(inputUrl, topic, override) {
  let name = topic || "Product";
  let product_url = "";
  if (inputUrl) {
    try {
      const u = new URL(inputUrl);
      product_url = u.origin;
      name = u.hostname.replace(/^www\./, "").split(".")[0];
      name = name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      /* keep topic */
    }
  }
  return { name, product_url, logo_url: "", ...DEFAULT_BRAND, ...(override || {}) };
}

// --- map CinematicScenePlan[] -> explainer templates -----------------------
function mapScenes(scenes) {
  const last = scenes.length - 1;
  const cycle = ["bullets", "stat", "comparison"];
  let c = 0;
  return scenes.map((s, i) => {
    let template;
    if (i === 0) template = "hero";
    else if (i === last) template = "cta";
    else if (s.camera_shot === "screen_capture") template = "screenshot_zoom";
    else template = cycle[c++ % cycle.length];
    return {
      title: s.title,
      duration_sec: Number(s.duration_sec) || 6,
      camera_shot: s.camera_shot,
      camera_motion: s.camera_motion,
      onscreen_text: s.onscreen_text || s.title || "",
      voiceover_line: s.voiceover_line || "",
      source_citation: s.source_citation || null,
      template,
    };
  });
}

async function main() {
  const jobId = process.argv[2];
  const brandPath = process.argv[3];
  if (!jobId) {
    console.error("usage: node render-from-research.mjs <research_job_id> [brand.json]");
    process.exit(1);
  }
  const supaUrl = need("NEXT_PUBLIC_SUPABASE_URL");
  const supaKey = need("SUPABASE_SERVICE_ROLE_KEY");
  const gateway = need("EXPLAINER_RENDER_GATEWAY_URL").replace(/\/+$/, "");
  const token = need("EXPLAINER_RENDER_TOKEN");
  need("R2_ENDPOINT"); need("R2_ACCESS_KEY_ID"); need("R2_SECRET_ACCESS_KEY"); need("R2_PUBLIC_URL");

  const supabase = createClient(supaUrl, supaKey);

  const { data: job, error: jErr } = await supabase
    .from("research_jobs")
    .select("id, input_url, topic, mode")
    .eq("id", jobId)
    .single();
  if (jErr || !job) throw new Error(`research job not found: ${jErr?.message || jobId}`);

  const { data: sb, error: sErr } = await supabase
    .from("research_storyboards")
    .select("scenes_json, created_at")
    .eq("research_job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (sErr || !sb?.scenes_json) throw new Error(`no storyboard for job ${jobId}: ${sErr?.message || ""}`);

  const rawScenes = Array.isArray(sb.scenes_json) ? sb.scenes_json : [];
  if (!rawScenes.length) throw new Error("storyboard has no scenes");

  const override = brandPath ? JSON.parse(readFileSync(brandPath, "utf8")) : null;
  const brand = deriveBrand(job.input_url, job.topic, override);
  const storyboard = { meta: { brand }, scenes: mapScenes(rawScenes) };

  console.log(`[render] job=${jobId} mode=${job.mode} brand=${brand.name} scenes=${storyboard.scenes.length}`);
  console.log(`[render] POST ${gateway}/api/render (this takes a few minutes)...`);
  const t0 = Date.now();
  const res = await fetch(`${gateway}/api/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ storyboard, product_url: brand.product_url }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`render service ${res.status}: ${body.slice(0, 300)}`);
  }
  const mp4 = Buffer.from(await res.arrayBuffer());
  console.log(`[render] received ${(mp4.length / 1e6).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  const key = `explainer/${jobId}-${rawScenes.length}scenes.mp4`;
  const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || "alphogenai-assets",
    Key: key, Body: mp4, ContentType: "video/mp4",
  }));
  const url = `${process.env.R2_PUBLIC_URL.replace(/\/+$/, "")}/${key}`;
  console.log(`\n✅ explainer ready:\n${url}`);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
