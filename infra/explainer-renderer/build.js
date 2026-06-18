#!/usr/bin/env node
/**
 * Explainer composition generator (POC).
 *
 * Reads a Product-mode storyboard (CinematicScenePlan[]-shaped) + an optional
 * assets manifest, and writes a HyperFrames project `index.html` (single
 * composition) with one section per scene, GSAP entrance + camera-motion
 * presets, and optional per-scene voice-over <audio> tracks.
 *
 * The LLM never writes this code: it only produces the storyboard DATA. These
 * are FIXED, parameterized templates (the production-safe model).
 *
 * Usage:
 *   node build.js <storyboard.json> <out-project-dir> [assets.json]
 * Then in <out-project-dir>: npx hyperframes render  → renders/<name>.mp4
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const FPS = 30;
const W = 1920;
const H = 1080;

// ---- helpers --------------------------------------------------------------
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// camera_motion → GSAP transform applied to the scene content over its duration
function cameraTween(sel, motion, start, dur) {
  switch (motion) {
    case "slow_push_in":
      return `tl.fromTo("${sel}",{scale:1.0},{scale:1.08,duration:${dur},ease:"none"},${start});`;
    case "pull_back":
      return `tl.fromTo("${sel}",{scale:1.1},{scale:1.0,duration:${dur},ease:"none"},${start});`;
    case "pan":
      return `tl.fromTo("${sel}",{xPercent:-3},{xPercent:3,duration:${dur},ease:"none"},${start});`;
    default:
      return ""; // static
  }
}

// ---- templates: each returns { html, anim } -------------------------------
// `anim(id, start, dur)` returns GSAP statements appended to the main timeline.
function tplHero(scene, b, id, start, dur) {
  const html = `
    <div id="${id}-bg" style="position:absolute;inset:0;background:radial-gradient(120% 120% at 20% 10%, ${b.primary} 0%, #0b1f00 70%);"></div>
    <div id="${id}-logo" style="position:absolute;left:140px;top:120px;height:64px;display:flex;align-items:center;gap:18px;color:${b.accent};font-weight:700;font-size:40px;">
      ${b.logo_url ? `<img src="${esc(b.logo_url)}" style="height:60px;filter:brightness(0) invert(1);"/>` : esc(b.name)}
    </div>
    <div id="${id}-h" style="position:absolute;left:140px;top:46%;transform:translateY(-50%);max-width:1300px;color:#fff;font-weight:800;font-size:104px;line-height:1.04;letter-spacing:-2px;">${esc(scene.onscreen_text)}</div>
    <div id="${id}-accent" style="position:absolute;left:148px;top:42%;width:120px;height:10px;border-radius:6px;background:${b.accent};"></div>`;
  const anim = `
    ${cameraTween(`#${id}`, scene.camera_motion, start, dur)}
    tl.from("#${id}-logo",{opacity:0,y:-30,duration:0.7,ease:"power2.out"},${start});
    tl.from("#${id}-accent",{scaleX:0,transformOrigin:"left center",duration:0.6,ease:"power3.out"},${start + 0.3});
    tl.from("#${id}-h",{opacity:0,y:40,duration:0.9,ease:"power3.out"},${start + 0.4});`;
  return { html, anim };
}

function tplScreenshotZoom(scene, b, id, start, dur, assets) {
  const shot = assets.screenshot_url || b.product_url_image || "";
  const inner = shot
    ? `<img src="${esc(shot)}" style="width:100%;height:100%;object-fit:cover;object-position:top center;"/>`
    : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#1c1c22,#2a2a33);"></div>`;
  const html = `
    <div id="${id}-bg" style="position:absolute;inset:0;background:#0b1f00;"></div>
    <div id="${id}-frame" style="position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:1440px;height:820px;border-radius:22px;overflow:hidden;box-shadow:0 50px 120px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.08);">
      <div style="height:46px;background:#15151a;display:flex;align-items:center;gap:9px;padding:0 18px;">
        <span style="width:13px;height:13px;border-radius:50%;background:#ff5f57;"></span>
        <span style="width:13px;height:13px;border-radius:50%;background:#febc2e;"></span>
        <span style="width:13px;height:13px;border-radius:50%;background:#28c840;"></span>
      </div>
      <div style="width:100%;height:calc(100% - 46px);overflow:hidden;">${inner}</div>
    </div>
    <div id="${id}-cap" style="position:absolute;left:50%;bottom:70px;transform:translateX(-50%);color:#fff;font-weight:700;font-size:52px;text-align:center;text-shadow:0 4px 24px rgba(0,0,0,.6);">${esc(scene.onscreen_text)}</div>`;
  const anim = `
    ${cameraTween(`#${id}-frame`, scene.camera_motion || "slow_push_in", start, dur)}
    tl.from("#${id}-frame",{opacity:0,y:60,duration:0.9,ease:"power3.out"},${start});
    tl.from("#${id}-cap",{opacity:0,y:30,duration:0.8,ease:"power2.out"},${start + 0.5});`;
  return { html, anim };
}

function tplBullets(scene, b, id, start, dur) {
  const items = (scene.bullets && scene.bullets.length ? scene.bullets : [scene.onscreen_text]).slice(0, 4);
  const rows = items
    .map(
      (t, i) => `
      <div id="${id}-li-${i}" style="display:flex;align-items:center;gap:28px;margin:0 0 34px;">
        <span style="flex:0 0 auto;width:66px;height:66px;border-radius:50%;background:${b.accent};color:${b.primary};display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:800;">✓</span>
        <span style="color:#fff;font-size:58px;font-weight:600;">${esc(t)}</span>
      </div>`
    )
    .join("");
  const html = `
    <div id="${id}-bg" style="position:absolute;inset:0;background:${b.primary};"></div>
    <div id="${id}-h" style="position:absolute;left:140px;top:130px;color:${b.accent};font-size:46px;font-weight:700;">${esc(scene.onscreen_text)}</div>
    <div style="position:absolute;left:140px;top:300px;right:140px;">${rows}</div>`;
  const anim =
    `tl.from("#${id}-h",{opacity:0,x:-30,duration:0.6,ease:"power2.out"},${start});` +
    items
      .map((_, i) => `tl.from("#${id}-li-${i}",{opacity:0,x:-60,duration:0.6,ease:"power3.out"},${(start + 0.5 + i * 0.55).toFixed(2)});`)
      .join("");
  return { html, anim };
}

function tplComparison(scene, b, id, start, dur) {
  const c = scene.comparison || { before_label: "Before", before: "", after_label: b.name, after: "" };
  const html = `
    <div id="${id}-bg" style="position:absolute;inset:0;background:#0b1f00;"></div>
    <div id="${id}-h" style="position:absolute;left:0;right:0;top:120px;text-align:center;color:#fff;font-size:64px;font-weight:800;">${esc(scene.onscreen_text)}</div>
    <div id="${id}-l" style="position:absolute;left:140px;top:300px;width:740px;height:560px;border-radius:20px;background:#1a1a1f;border:1px solid rgba(255,255,255,.08);padding:56px;">
      <div style="color:#ff6b6b;font-size:38px;font-weight:700;margin-bottom:28px;">${esc(c.before_label)}</div>
      <div style="color:#cfcfd4;font-size:56px;font-weight:600;line-height:1.2;">${esc(c.before)}</div>
    </div>
    <div id="${id}-r" style="position:absolute;right:140px;top:300px;width:740px;height:560px;border-radius:20px;background:${b.primary};border:2px solid ${b.accent};padding:56px;">
      <div style="color:${b.accent};font-size:38px;font-weight:700;margin-bottom:28px;">${esc(c.after_label)}</div>
      <div style="color:#fff;font-size:56px;font-weight:700;line-height:1.2;">${esc(c.after)}</div>
    </div>`;
  const anim = `
    tl.from("#${id}-h",{opacity:0,y:-20,duration:0.6,ease:"power2.out"},${start});
    tl.from("#${id}-l",{opacity:0,x:-50,duration:0.7,ease:"power3.out"},${start + 0.4});
    tl.from("#${id}-r",{opacity:0,x:50,duration:0.7,ease:"power3.out"},${start + 0.7});`;
  return { html, anim };
}

function tplStat(scene, b, id, start, dur) {
  const s = scene.stat || { value: scene.onscreen_text, label: "" };
  const html = `
    <div id="${id}-bg" style="position:absolute;inset:0;background:radial-gradient(120% 120% at 50% 30%, ${b.primary} 0%, #07160a 75%);"></div>
    <div id="${id}-v" style="position:absolute;left:0;right:0;top:40%;transform:translateY(-50%);text-align:center;color:${b.accent};font-size:280px;font-weight:800;letter-spacing:-6px;">${esc(s.value)}</div>
    <div id="${id}-l" style="position:absolute;left:0;right:0;top:64%;text-align:center;color:#fff;font-size:58px;font-weight:600;">${esc(s.label)}</div>`;
  const anim = `
    tl.from("#${id}-v",{opacity:0,scale:0.6,duration:0.9,ease:"back.out(1.6)"},${start});
    tl.from("#${id}-l",{opacity:0,y:30,duration:0.7,ease:"power2.out"},${start + 0.6});`;
  return { html, anim };
}

function tplCta(scene, b, id, start, dur) {
  const url = (b.product_url || "").replace(/^https?:\/\//, "");
  const html = `
    <div id="${id}-bg" style="position:absolute;inset:0;background:${b.accent};"></div>
    <div id="${id}-h" style="position:absolute;left:0;right:0;top:38%;transform:translateY(-50%);text-align:center;color:${b.primary};font-size:96px;font-weight:800;letter-spacing:-2px;">${esc(scene.onscreen_text)}</div>
    <div id="${id}-btn" style="position:absolute;left:50%;top:60%;transform:translateX(-50%);background:${b.primary};color:#fff;font-size:46px;font-weight:700;padding:30px 70px;border-radius:60px;">${esc(url || b.name)}</div>`;
  const anim = `
    tl.from("#${id}-h",{opacity:0,scale:0.9,duration:0.7,ease:"power3.out"},${start});
    tl.from("#${id}-btn",{opacity:0,y:40,duration:0.7,ease:"back.out(1.4)"},${start + 0.5});`;
  return { html, anim };
}

const TEMPLATES = {
  hero: tplHero,
  screenshot_zoom: tplScreenshotZoom,
  bullets: tplBullets,
  comparison: tplComparison,
  stat: tplStat,
  cta: tplCta,
};

// ---- composition assembler ------------------------------------------------
function build(storyboard, assets) {
  const b = storyboard.meta?.brand || {};
  const scenes = storyboard.scenes || [];
  let t = 0;
  const sections = [];
  const anims = [];
  const audios = [];

  scenes.forEach((scene, i) => {
    const id = `sc${i}`;
    const planned = Math.max(2, Number(scene.duration_sec) || 5);
    // If a voice-over exists, the scene must last at least as long as the narration
    // (+ small tail) so the line is never cut off. Otherwise keep the planned beat.
    const audio = (assets.audio || []).find((a) => a.scene_index === i);
    const dur = audio?.duration_sec
      ? Math.max(planned, Math.ceil((Number(audio.duration_sec) + 0.7) * 10) / 10)
      : planned;
    const tpl = TEMPLATES[scene.template] || tplHero;
    const { html, anim } = tpl(scene, b, id, t, dur, assets);
    sections.push(
      `    <div id="${id}" class="clip" data-start="${t}" data-duration="${dur}" data-track-index="${i}" style="position:absolute;inset:0;overflow:hidden;">\n${html}\n    </div>`
    );
    anims.push(`    // scene ${i} (${scene.template})\n    ${anim.trim()}`);
    if (audio?.url) {
      audios.push(
        `    <audio class="clip" data-start="${t}" data-duration="${dur}" data-track-index="${100 + i}" data-volume="1" src="${esc(audio.url)}"></audio>`
      );
    }
    t += dur;
  });

  const total = t;
  const fontLink = b.font
    ? `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(b.font)}:wght@400;600;700;800&display=swap" rel="stylesheet">`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${W}, height=${H}" />
  ${fontLink}
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000;}
    body{font-family:"${b.font || "Inter"}",sans-serif;}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}">
${sections.join("\n")}
${audios.join("\n")}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
${anims.join("\n")}
    window.__timelines["main"] = tl;
  </script>
</body>
</html>
`;
}

// ---- main -----------------------------------------------------------------
const [, , storyboardPath, outDir, assetsPath] = process.argv;
if (!storyboardPath || !outDir) {
  console.error("usage: node build.js <storyboard.json> <out-project-dir> [assets.json]");
  process.exit(1);
}
const storyboard = JSON.parse(readFileSync(storyboardPath, "utf8"));
const assets = assetsPath && existsSync(assetsPath) ? JSON.parse(readFileSync(assetsPath, "utf8")) : {};
// Auto-detect a captured product screenshot in the project assets dir.
if (!assets.screenshot_url && existsSync(`${outDir}/assets/shot.png`)) {
  assets.screenshot_url = "assets/shot.png";
}
// Auto-detect per-scene voice-over generated by the TTS step (Kokoro by default).
if (!assets.audio && existsSync(`${outDir}/assets/audio-manifest.json`)) {
  assets.audio = JSON.parse(readFileSync(`${outDir}/assets/audio-manifest.json`, "utf8"));
}
const name = (storyboard.meta?.brand?.name || "explainer").toLowerCase().replace(/[^a-z0-9]+/g, "-");

mkdirSync(outDir, { recursive: true });
mkdirSync(`${outDir}/assets`, { recursive: true });
writeFileSync(`${outDir}/meta.json`, JSON.stringify({ id: name, name, createdAt: "1970-01-01T00:00:00.000Z" }, null, 2));
writeFileSync(
  `${outDir}/hyperframes.json`,
  JSON.stringify(
    { $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } },
    null,
    2
  )
);
writeFileSync(
  `${outDir}/package.json`,
  JSON.stringify({ name, private: true, type: "module", scripts: { render: "npx --yes hyperframes@0.6.110 render" } }, null, 2)
);
writeFileSync(`${outDir}/index.html`, build(storyboard, assets));
console.log(`[build] wrote ${outDir}/index.html — ${storyboard.scenes.length} scenes`);
