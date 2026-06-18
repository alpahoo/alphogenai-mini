# Research / Explainer Premium Studio UI Spec

Status: T-1201 spec, docs-only
Owner: Codex
Date: 2026-06-19
Scope: Research Studio, Explainer Studio, Research-to-Create handoff, post-generation actions
Non-runtime: no code, no route, no DB, no provider, no migration changes in this task

## 1. Why this exists

AlphoGenAI now has a strong technical engine: Research discovery, extraction, LiteLLM angles/scripts, cinematic storyboard planning, source media collection, Director handoff, voice-over text, voice-over mux, and deterministic branding overlays. The missing layer is the premium product experience that makes this feel like a studio instead of a chain of backend buttons.

The current product can produce real sourced videos, but the user experience still exposes too much of the raw pipeline: long source lists, unclear waiting states, separate actions, and limited review before rendering. The target is a Runway/TopView-level sense of clarity and control, adapted to AlphoGenAI's own architecture and roadmap. This is not a request to clone TopView; it is a request to make AlphoGenAI's existing engine legible, premium, and useful.

## 2. Product north star

Turn a topic, URL, product page, or watchlist change into a reviewed video package:

1. Research gathers sources and evidence.
2. The user chooses an angle and reviews the script.
3. The user reviews scenes, references, voice, and brand treatment before generation.
4. AlphoGenAI renders the video.
5. Post-production adds voice-over, verified text, branding, captions, and exports.

The user should feel like they are directing a compact production studio, not debugging a pipeline.

## 3. Non-goals

- Do not redesign unrelated backend systems.
- Do not add migrations in this spec.
- Do not change model routing, LiteLLM, SearXNG, extraction, Seedance, Modal, or provider contracts.
- Do not auto-use third-party media without explicit user selection.
- Do not promise exact text inside generative video frames. Exact text belongs to deterministic overlay/post-production.
- Do not imply Story video lip-sync unless the workflow actually routes through the lip-sync path.
- Do not copy TopView, Runway, or any competitor UI verbatim.

## 4. Design principles

### Outcome first

The first screen should ask what the user wants to make and show the likely output: explainer, news recap, product demo, UGC ad, tutorial, competitor brief, or social pack. Implementation details stay secondary.

### Review before render

Research should always create a reviewable plan before spending video credits. The user sees sources, angle, script, scenes, references, voice, and branding before generation.

### One primary action per stage

Each stage needs a single obvious next action. Secondary controls should be discoverable but not visually equal to the main action.

### Compact by default, expandable on demand

Raw source lists and extracted text should not dominate the page. Show the top evidence and selected references first; let the user expand details when needed.

### Deterministic text and brand layer

Text overlays, lower-thirds, captions, source cards, logos, and watermarks must be deterministic post-production artifacts, not instructions left to the video model.

### Explicit media rights

Source media starts as suggestions. A user must select it before it enters the production plan. All external media should carry rights status and source attribution.

### Honest voice modes

Voice-over, narration, avatar presenter, and lip-sync are separate production modes. The UI must explain which one is active and what it will do.

### Cost and time transparency

Before render, show estimated duration, generation cost, voice-over cost if relevant, and whether post-production overlay/voice actions are included or separate.

## 5. Visual direction

The visual target is a premium creative workspace: calm, media-forward, precise, and editorial.

Use a mostly light workspace for productivity, with dark studio/canvas surfaces only where they help the user focus on media or render controls. Avoid turning the whole app into a one-note black/neon interface. AlphoGenAI should feel premium and production-ready, not like a skin on top of the current pipeline.

Preferred patterns:

- Wide media preview or storyboard canvas at the center.
- Sticky right rail for readiness, cost, voice, brand, and next action.
- Compact cards with 8px or smaller radius.
- Mode chips for workflow type.
- Timeline or scene strip for scene-level work.
- Tooltips and examples on first-contact forms.
- Clear loading/progress states for every long-running action.
- Dense lists only inside framed panels with collapse/expand.

## 6. Screen A - Research Home Command Center

Purpose: let the user start the right kind of research plan without feeling lost.

### Layout

- Left workspace nav remains consistent with the rest of AlphoGen.
- Main hero becomes a compact command center, not a marketing hero.
- New brief panel has examples inline and small tooltips explaining each field.
- Recent research and watchlists become actionable production entries, not passive records.

### Primary fields

- Brief: what video should be made, who it is for, and what structure is desired.
- Optional URL: official page, article, product page, docs, changelog, or competitor page.
- Mode: News, Tutorial, Product, Competitor, UGC, Explainer.
- Target duration: 15s, 30s, 60s, 90s, custom.
- Output style: Presenter, Explainer, Social Clip, Director Story.

### Needed states

- Start Research loading: button disabled, progress label, subtle bar, and message such as "Creating research brief...".
- Source discovery loading: "Finding sources from trusted pages...".
- Extraction loading: "Extracting usable evidence...".
- LLM generation loading: "Drafting angles..." or "Writing storyboard...".

### Acceptance criteria

- User understands what each field does before clicking.
- Clicking Start Research immediately shows feedback.
- Recent plans expose status and next action: Open, Continue, Send to Director, Render Explainer.

## 7. Screen B - Research Plan Review

Purpose: turn a raw research job into a clear editorial plan.

### Header

- Status pill: Brief, Sources ready, Angles ready, Script ready, Approved, Sent to Director.
- Counts: sources, selected references, angles, scenes.
- Main action: the next incomplete step.

### Sources panel

Current issue: large source lists can consume the page and hide the actual creative decision.

Recommended behavior:

- Show top 5 sources by default.
- Add "Show all sources" drawer or expanded view.
- Separate extracted sources from blocked/unusable sources.
- Show source quality: official, docs, media, social, video, unknown.
- Never show huge extracted text by default.

### Suggested references panel

- Show a compact grid of source media candidates.
- Each card shows thumbnail, source domain, kind, rights status, and selection button.
- Selected references move into a small sticky tray.
- External thumbnails use no-referrer and fallback placeholders.
- Copy should say: "Selected references are copied privately and sent to Director.".

### Angles panel

- Show 3-5 angle cards.
- Each card has title, hook, positioning, fit score, and source basis.
- Selected angle is visually clear.
- Main action after selection: Generate script.

### Script and storyboard panel

Scene cards should show:

- Title and duration.
- Voice-over line.
- On-screen text line.
- Camera/lighting/mood summary.
- Selected reference assets.
- Source citation.
- Risk note if media/text may need review.

Important: users should be able to understand whether a scene will be presenter-led, b-roll, product shot, explainer graphic, or source card.

### Director handoff

Keep both locations:

- Right rail: persistent "Send to Director".
- Inline after storyboard: a second "Approve first / Send to Director" button, because this is where the user's decision naturally happens.

## 8. Screen C - Explainer Studio

Purpose: provide a premium review-before-render experience for code-rendered explainers.

The explainer pipeline is technically strong but needs a real studio surface before render.

### Structure

Tabs:

- Script
- Scenes
- Assets
- Voice
- Brand
- Render

Main areas:

- Center preview canvas.
- Bottom scene timeline.
- Right inspector for selected scene, voice, brand, and render settings.

### Script tab

- Editable narration script.
- Per-scene voice-over lines.
- Word count and estimated duration.
- Warnings if narration is too long for the target duration.

### Scenes tab

- Scene list with duration, title, visual intent, camera/motion, on-screen text, and source citation.
- Scene preview placeholder or rendered still.
- Ability to reorder scenes in a later phase.

### Assets tab

- Selected source references.
- Add/remove selected references.
- Rights status visible.
- No auto-injection of external images without confirmation.

### Voice tab

- Voice selector.
- Preview voice sample.
- Narration mode clearly labeled as voice-over, not lip-sync.
- Speed/pacing warning if script is too dense.

### Brand tab

- Logo, watermark, lower-third style, caption style.
- Default AlphoGen treatment until user uploads official brand assets.
- Deterministic text only.

### Render tab

- Format, duration, aspect ratio, quality, estimated render time.
- Primary action: Render explainer.
- Post-render actions: Add voice-over, Apply branding, Export.

## 9. Screen D - Create / Director integration

Purpose: make the Research handoff feel intentional, not like pasted text.

### Current issue

Research can send a plan to Create, but the Create page still reads like a generic prompt form with a Director panel underneath. The user needs to see that this is a production brief.

### Recommended changes

- Add a production brief badge and a compact Research origin summary.
- Show selected references as a tray near the prompt, not only inside the text area.
- Preserve the Director panel but make Research-backed scenes visually distinct.
- Voice-over text should be visible and editable when Research provided narration.
- Make Story vs Presenter clear:
  - Story: voice-over track and cinematic scenes.
  - Presenter/lip-sync: avatar/person-led path with matching provider route.

### Post-generation action center

On the job page, consolidate:

- Download
- Share
- Copy prompt
- Favorite
- Duplicate
- Use as reference
- Add voice-over
- Apply branding
- Create similar

For research-backed jobs, Add voice-over and Apply branding should be framed as post-production steps, with current status shown.

## 10. Data mapping

This spec uses existing data. It does not require a migration.

- `research_jobs`: topic, mode, target duration, status.
- `research_sources`: discovered and extracted evidence.
- `research_source_media`: suggested references, selection state, storage path, rights status.
- `research_angles`: selected editorial direction.
- `research_scripts`: approved script and quality metadata.
- `research_storyboards.scenes_json`: scene plan, voice-over line, on-screen text, camera/motion, source citation.
- `jobs.metadata.research_job_id`: link from generated video back to research plan.
- `jobs.voiceover_text` / `voiceover_url`: narration source and generated audio.
- `jobs.video_url`: raw generated video.
- `jobs.output_url_final`: post-produced video after voice/overlay.

## 11. Roadmap

### T-1201 - Premium Research/Explainer UI spec

Status: done in this document.

### T-1202 - Research Home clarity pass

Add tooltips, better examples, loading states, and clearer recent-plan actions. No DB changes.

### T-1203 - Research Plan Review compact layout

Compact sources, selected references tray, clearer angle/script/storyboard review. Use existing data.

### T-1204 - Explainer Studio review-before-render

Create the tabbed review surface for script/scenes/assets/voice/brand/render before calling the existing explainer route.

### T-1205 - Voice and brand controls

Expose voice preview, voice mode honesty, brand/logo/watermark/caption controls. Reuse T-1111/T-1113 runtime.

### T-1206 - Post-generation action center

Polish the job page actions into a coherent studio control bar.

### T-1207 - Visual QA and mobile pass

Screenshots at desktop and mobile, text overflow checks, sticky rail behavior, and auth-gated smoke test.

## 12. Acceptance criteria

- A new user understands Research Studio without external explanation.
- The user always sees progress after clicking a long-running action.
- Source lists no longer bury the creative decision.
- The user can review scenes, voice, references, and brand before spending render credits.
- Exact text and logos are presented as deterministic post-production, not model magic.
- Voice-over vs lip-sync is explicit.
- Research-backed jobs expose post-production actions in a coherent way.
- The experience feels like a premium production studio while respecting AlphoGenAI's current architecture.

## 13. Open questions

- Should Explainer Studio be a separate route or a mode inside Research Plan Review?
- What is the default official AlphoGen logo asset for overlays?
- Should selected references be capped at 4, 6, or 8 for Director handoff?
- Should Research Home expose templates first, or keep the brief input first?
- Which voice should be the default for Research explainers?
- Should render presets be organized by platform, use case, or model?

## 14. Guidance for implementation agents

Before coding any T-120x task:

1. Audit the current component and route first.
2. Reuse existing helpers and data contracts.
3. Keep runtime changes small and isolated.
4. Do not introduce a migration unless a later task explicitly approves it.
5. Coordinate with Claude Code before changing infra, DB, or provider routing.
6. Prefer UI clarity and honest state over adding new hidden automation.