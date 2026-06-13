# Post-Production Text/Brand Overlay Spec (T-1111a)

**Status:** Spec / audit (docs). No runtime code yet. **Payload-only** (no migration at start).
**Owner:** Create / Director / Research
**Scope:** Add a deterministic finishing pass that burns **exact** text + branding (logo, watermark, titles, lower-thirds, captions, source/stat/model cards) onto the finished video — so critical text never depends on the diffusion model (kills "Languarce"-type hallucinations and unauthorized logos).

---

## 1. Why (problem)

The video model (Seedance/Wan) renders cinematic visuals well but is unreliable for **on-screen text** (hallucinated/garbled) and **brand assets** (it invented a Pandaily logo + "AI Game Changers" watermark). Critical text/branding must be produced **deterministically**, not by diffusion. T-1109 correctly composes *cinematic intent* into `prompt`; T-1111 adds a separate **deterministic overlay layer** on the final render.

---

## 2. Audit (current capabilities — verified)

- **Modal already is a full FFmpeg+Pillow environment**: `apt_install("ffmpeg")`, `pillow`, `imageio[ffmpeg]`; existing steps do frames→MP4 (libx264), scene concat, last-frame extraction, and **audio/music muxing** (`modal_app/video_pipeline.py`). → Overlay is a natural extension, no new infra.
- **Final video lands in R2** (provider outputs via `downloadAndUploadToR2`; Modal-Wan outputs uploaded too). → The overlay pass can operate on the finished MP4 (download → overlay → re-upload), so it works for **both EvoLink/Seedance and Modal/Wan** outputs.
- **Job payload path exists**: Create already threads structured data to the job (clientScenes path, references). → The overlay spec can travel **payload-only** in the job args to Modal — **no DB migration needed** to start.
- **Data sources are deterministic**: titles/captions/citations come from Research DB (`research_scripts`, `research_angles`, `research_sources`, `scenes_json` incl. `voiceover_line`, `source_citation`) — never the model.

---

## 3. `OverlayPlan` (payload-only contract)

Passed in the job args (Create/handoff → Modal). No new table for V1.

```ts
interface OverlayPlan {
  enabled: boolean;
  safe_area_pct?: number;            // margin keep-out, default 5%
  brand?: {
    logo_url?: string | null;        // AlphoGen logo (our asset) OR user logo (references bucket, signed). Never third-party.
    logo_position?: 'tl' | 'tr' | 'bl' | 'br';   // default 'br'
    logo_opacity?: number;           // 0..1, default 0.9
    watermark_text?: string | null;  // optional small brand text
  };
  elements: OverlayElement[];
}

interface OverlayElement {
  kind: 'title' | 'lower_third' | 'caption' | 'source_card' | 'stat_card' | 'model_card' | 'custom';
  text: string;                      // EXACT text (from DB), never model-generated
  subtext?: string | null;
  start_sec: number;                 // timing window (derived from scene durations)
  end_sec: number;
  position?: 'top' | 'center' | 'lower_third' | 'bottom';
}
```

Timing comes from the storyboard scenes' cumulative `duration_sec` (we already have them). Captions = per-scene `voiceover_line` (exact). Source/stat/model cards = from `source_citation`/script data.

---

## 4. Rendering contract

- **Pillow → PNG (alpha) → ffmpeg `overlay`** with `enable='between(t,start,end)'` per element (NOT `drawtext`): precise typography, multi-line wrapping, rounded cards, lower-thirds, logos, **correct accents/UTF-8** (the actual fix for garbled text).
- **Bundled font** in the Modal image (e.g. Inter or DejaVuSans) for deterministic rendering incl. accents.
- **Safe area**: place overlays in keep-out margins / lower third so they don't fight the generated content; instruct the model (T-1109 prompt) to leave those zones clean and avoid rendering text.
- Logo composited as a separate `overlay` input (PNG with alpha), positioned + opacity.
- Output: a new R2 object (e.g. `<job>/final_branded.mp4`); keep the raw render too.

---

## 5. Where in the Modal pipeline

A **new CPU-only Modal function** `apply_overlays(video_url, overlay_plan) -> branded_url`, run **after** the final mux. **CPU, not the A100** (ffmpeg/Pillow need no GPU) → cheap. Falls back to the raw video if overlay fails (never blocks delivery).

---

## 6. Branding / logo policy

- Logos limited to: **AlphoGen logo** (asset we control) and **user logo** (uploaded → `references` bucket, ownership-validated). 
- **Never** third-party/source logos automatically (the Pandaily case = rights risk). A source logo may only be used if the user explicitly selected it via T-1110 (`user_confirmed`).
- Watermark text is our own brand string, user-controlled.

---

## 7. Modes (V1)

- **Story / Research (default):** captions (exact voiceover lines) + lower-thirds (angle/title) + source cards + optional AlphoGen/user logo + watermark. No lip-sync involved.
- **Presenter (later, T-1113):** overlays still apply; lip-sync handled by the HeyGen pipeline separately.

---

## 8. Non-goals (V1)

- ❌ No DB migration (payload-only); brand presets persistence is a later, separately-validated step.
- ❌ No GPU usage for overlays (CPU Modal function).
- ❌ No third-party logo auto-insertion.
- ❌ No model-generated critical text; overlays are deterministic.
- ❌ No lip-sync here (that's T-1113); no n8n; LiteLLM stays the Research LLM path; providers stay confidential in UI.

---

## 9. Découpage

- **T-1111a** — this spec.
- **T-1111b** — pure helper `lib/overlay/overlay-plan.ts`: build `OverlayPlan` deterministically from Research data + scene timings (captions, cards, safe-area, brand). Unit-testable, no network, no provider names. + tests.
- **T-1111c** — Modal CPU function `apply_overlays` (Pillow render + ffmpeg overlay) + thread `OverlayPlan` through the job payload to Modal + re-upload branded MP4. Real e2e on a sample job.

---

## 10. Risks (backend/DB/provider)

- **Modal cost**: keep `apply_overlays` on a CPU function; +1 download/encode + double R2 storage (raw + branded) — minor.
- **Payload size**: `OverlayPlan` travels in job args — bound element count + text lengths to keep the payload small.
- **Fonts/encoding**: must bundle a Unicode font in the Modal image, else accents break.
- **No migration**: V1 is payload-only by design; if we later persist brand presets per user → migration, validated separately.
- **Provider confidentiality**: overlays are our own render → no leak; logos restricted to AlphoGen/user/source-confirmed.
- **Failure isolation**: overlay failure must fall back to the raw video, never fail the job.

---

## Open decision for you
1. V1 element set: confirm **captions + lower-third + source_card + logo + watermark** (stat_card/model_card optional/next).
2. Confirm **payload-only** (no migration) for T-1111b/c.
3. Provide/confirm the **AlphoGen logo asset** (path/URL) to use as the default brand mark.

---

## Version history

| Date | Status | Notes |
|------|--------|-------|
| 2026-06-12 | Spec draft | T-1111a post-production overlay (deterministic text/brand) |
