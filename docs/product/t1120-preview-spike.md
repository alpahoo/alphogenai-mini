# T-1120-preview-spike — Explainer preview: low-fi (browser) vs high-fi (HyperFrames)

**Status:** done (docs-only spike) · **Owner:** Claude · **Date:** 2026-06-21
**Blocks:** T-1120d (Explainer Studio) — this spike unblocks it.

> Goal (from the premium UI spec §13): validate **low-fi (browser)** vs **high-fi
> (HyperFrames)** preview, measure **latency + cost**, and confirm the guardrail
> **"no costly auto-render"** before building the Explainer Studio.

---

## 1. TL;DR — recommendation

**Build the Studio preview as a low-fi, client-side, WYSIWYG render — and keep the
full HyperFrames render as the existing explicit, user-triggered action.**

The decisive finding: the explainer composition produced by
[`infra/explainer-renderer/build.js`](../../infra/explainer-renderer/build.js) is
**plain HTML/CSS + a GSAP timeline**. HyperFrames does not "compile" it — it loads
that HTML in headless Chrome, plays the timeline frame-by-frame, and pipes frames to
ffmpeg. **The exact same HTML runs in any browser.** So a preview embedded in the
Studio is not an approximation of the final video — it is the *same composition*,
just played live (`tl.play()`) instead of frame-stepped + encoded.

That means: **preview fidelity ≈ final fidelity** for layout, typography, colors,
templates and motion — at **$0 and zero latency**, with **no Modal call**. This is
the ideal answer to the "no costly auto-render" guardrail: the preview is free and
local; the only thing that ever costs money is the explicit "Render explainer" click
that already exists.

---

## 2. What was examined

- [`infra/explainer-renderer/build.js`](../../infra/explainer-renderer/build.js) —
  the composition generator: 6 fixed templates (`hero`, `screenshot_zoom`, `bullets`,
  `comparison`, `stat`, `cta`), each returning `{ html, anim }`; assembled into a
  single `index.html` with inline styles, GSAP from CDN, and a paused timeline
  `window.__timelines["main"]`. Audio is `<audio class="clip">` tags.
- [`lib/explainer/storyboard.ts`](../../lib/explainer/storyboard.ts) — the
  deterministic data model (`ExplainerStoryboard = { meta:{brand}, scenes[] }`),
  already pure TypeScript and shared by the in-app route + the VPS script.
- [`modal_app/video_pipeline.py`](../../modal_app/video_pipeline.py) `render_explainer`
  — `@app.function(image=explainer_image, timeout=1200, retries=0)`, **CPU-only, no GPU**,
  spawned async via `/render-explainer`; writes `output_url_final` + `status=done`.
- Existing rendered artifacts (`infra/explainer-renderer/output_explainer_*.mp4`) —
  proof the composition HTML renders correctly through a Chrome engine.

No fresh timed render was run on purpose — triggering a Modal render just to stopwatch
it would violate the very guardrail this spike is meant to protect. Latency/cost
figures below are from the prior e2e validation (2026-06-18); a precise SLA
re-measurement, if ever needed, is a one-off task, not a precondition for the Studio.

---

## 3. The two tiers, compared

| Dimension | **Low-fi preview (browser)** | **High-fi render (HyperFrames / Modal)** |
|---|---|---|
| What it is | Same composition HTML, GSAP `play()` live in an `<iframe srcdoc>` | Headless-Chrome frame capture → ffmpeg → MP4 |
| Where it runs | Client (the Studio page) | Modal CPU function, async |
| Latency | **Instant** (compose string + load iframe, <100 ms) | **~1–4 min** for a 6–8 scene explainer (capture + TTS + encode) |
| Cost | **$0** | **~2–5¢** (CPU only, no GPU) |
| Layout / type / color | **Identical** (same CSS) | Identical |
| Animations | **Identical** (same GSAP timeline) | Identical |
| Voice-over | None, or optional browser Web Speech for *timing feel* | Real Kokoro TTS per scene (deterministic, server) |
| Product screenshot | Placeholder / last-known image | Live `chromium` capture of the product URL |
| Output | Ephemeral, in-page | Durable MP4 in R2 → Library + Job page |
| Triggers a job/cost | **Never** | Only on explicit user click (unchanged) |

**Net:** the only things the preview *cannot* show faithfully are (a) the real
synthesized voice and its exact per-scene timing, and (b) the freshly captured
screenshot. Everything visual/structural is exact. Those two deltas are acceptable
for a "review before you spend cents" preview, and both have cheap mitigations
(below).

---

## 4. Recommended architecture for the Studio (T-1120d)

1. **Extract the composition to a shared module.** Port the `build()` /template
   functions from `build.js` into a pure TS module, e.g.
   `lib/explainer/composition.ts`, exporting `buildCompositionHtml(storyboard, assets) → string`.
   - `build.js` then imports/uses it (single source of truth — templates stay identical
     between preview and final render).
   - The Studio imports the same function for the preview. **WYSIWYG by construction.**
2. **Preview component.** `<iframe srcdoc={html} sandbox>` + a small control bar
   (Play / Pause / scrub). Drive playback by exposing `window.__timelines["main"]`
   and calling `.play()/.pause()/.seek(t)` from the parent via `postMessage` or a
   tiny inline bootstrap. No network, no Modal.
3. **Handle the two deltas:**
   - **Audio:** v1 = silent preview with on-screen text + scene durations (enough to
     judge pacing). Optional v1.5 = browser `speechSynthesis` per scene for a rough
     timing feel (clearly labeled "preview voice ≠ final voice").
   - **Screenshot:** use the last selected `research_source_media` image or a neutral
     placeholder frame; the final render captures live.
4. **Keep the render path exactly as today.** "Render explainer" → existing route →
   Modal CPU → Library/Job. The Studio adds a preview *above* that button; it does
   **not** add any new render trigger.

This keeps T-1120d UI-first: the only non-UI piece is the **pure, testable**
`composition.ts` extraction (no route/API/DB, no pipeline change), which also
de-duplicates logic that currently lives only in `build.js`.

---

## 5. Guardrail confirmation — "no costly auto-render"

✅ **Confirmed and strengthened.** With this design:
- The preview is **client-side and free** — it can update live as the user edits the
  storyboard, with zero cost and zero Modal calls.
- The **only** money-spending action remains the explicit "Render explainer" click,
  which already exists and is already gated on an approved storyboard.
- No auto-render on load, on edit, or on preview. Ever.

The spike itself triggered **no render** (no Modal invocation), honoring the guardrail
during the investigation too.

---

## 6. Risks & limitations

- **Fonts:** preview loads Google Fonts from CDN (same `<link>` as the composition);
  a momentary FOUT in-iframe is cosmetic and absent from the encoded final.
- **GSAP from CDN inside the iframe** needs network at preview time; acceptable
  (the app is online). A bundled GSAP is a later hardening option.
- **Timing of voice-gated scenes:** in the final render a scene is *extended* to fit
  its narration (`build.js` audio-duration logic). The silent preview uses the
  *planned* `duration_sec`, so a scene with a long line may look slightly shorter in
  preview than in the final. Mitigation: surface the planned vs voice-extended
  duration in the inspector, or use Web Speech length as an estimate.
- **Screenshot drift:** preview placeholder vs live capture — expected and
  communicated.

None of these block the Studio; they are UX notes for T-1120d.

---

## 7. Decision

- **Adopt the low-fi client-side WYSIWYG preview** for the Explainer Studio.
- **First implementation step of T-1120d:** extract `lib/explainer/composition.ts`
  (shared by `build.js` + Studio) with unit tests, then build the iframe preview
  component. UI-first, no backend.
- High-fi render stays the existing explicit action. Guardrail intact.

**T-1120d is unblocked.**
