# AlphoResearch Engine Spec

Status: draft for validation  
Owner: product / architecture  
Scope: docs-only, no runtime code, no migrations

## Product Intent

AlphoResearch turns a topic, URL, product page, competitor, or trend into a video-ready production brief:

```text
sources -> editorial angles -> script -> storyboard -> AlphoGen video payload
```

The product should feel like a research desk for creators, not a fully autonomous publishing bot. V1 must help the user produce better, sourced videos while keeping approval steps explicit.

## Non-Negotiables

- No n8n. The user already has an orchestrator/workflow layer.
- No automatic publishing in V1.
- No hidden spend: every LLM, crawl, TTS, or video step needs quota/cost visibility before expensive actions.
- No direct public exposure of provider/internal infrastructure names in user-facing UI.
- No Supabase local as production source of truth. Supabase Cloud remains the canonical database.
- No code or DB migration before this spec is validated.

## Recommended Architecture

```text
AlphoGenAI Next.js app
  |
  | internal APIs
  v
AlphoResearch module
  |
  | service adapters
  +-- SearXNG          search discovery
  +-- Crawl4AI         readable extraction / Markdown
  +-- changedetection  watchlist triggers, later phase
  +-- Speaches/Kokoro  low-cost voice-over, later phase
  +-- Redis/Dragonfly  cache / rate limits / lightweight queues, optional
  +-- LiteLLM          optional LLM gateway, only after auth/cost policy is clear
  |
  v
Supabase Cloud
```

Hostinger VPS should run auxiliary services only: search, crawl, monitoring, audio experiments, cache. Vercel/Supabase remain the SaaS application and data backbone.

## V1 Product Flow

1. User enters a topic or URL.
2. AlphoResearch creates a research job.
3. The system discovers sources.
4. The user reviews selected sources.
5. The system extracts readable content.
6. The system proposes 3 to 5 editorial angles.
7. The user selects an angle.
8. The system generates a script.
9. The system converts the script into a storyboard compatible with existing Director scenes.
10. The user sends the storyboard to Create/Director manually.

The important product choice: generate angles before generating scripts. This prevents generic videos and makes AlphoResearch feel strategic.

## V1 Modes

### News / Trend

Input: topic or trend.  
Output: sources, what changed, what is uncertain, angles, YouTube script, storyboard.

### Tutorial

Input: URL, docs page, product page, or prompt.  
Output: explanation structure, steps, screenshots/B-roll suggestions, voice-over script, storyboard.

### Product

Input: product URL or product description.  
Output: benefits, objections, UGC hooks, ad script, product-demo storyboard.

### Competitor

Input: competitor URL/name.  
Output: positioning summary, differentiators, comparison script, video angle.

## Proposed API Shape

These are future contracts, not implemented by this spec.

```ts
POST /api/research/create
GET /api/research/[id]
POST /api/research/[id]/discover-sources
POST /api/research/[id]/extract-sources
POST /api/research/[id]/generate-angles
POST /api/research/[id]/select-angle
POST /api/research/[id]/generate-script
POST /api/research/[id]/approve-script
POST /api/research/[id]/send-to-director
```

V1 should prefer explicit step endpoints over one long autonomous endpoint. That makes debugging, cost control, and user review easier.

## Proposed Data Model

Future migration candidates:

```sql
research_jobs
- id
- user_id
- topic
- input_url
- mode -- news | tutorial | product | competitor
- status -- draft | discovering | extracting | ready_for_angles | scripting | approved | sent_to_director | failed
- language
- target_duration
- created_at
- updated_at

research_sources
- id
- research_job_id
- url
- title
- source_type -- official | media | forum | youtube | github | docs | product | unknown
- credibility_score
- extracted_markdown
- published_at
- selected
- created_at

research_angles
- id
- research_job_id
- title
- hook
- positioning
- score
- selected
- created_at

research_scripts
- id
- research_job_id
- angle_id
- script
- sections_json
- quality_score
- approved
- created_at

research_storyboards
- id
- research_job_id
- script_id
- scenes_json
- created_at
```

RLS/ownership must follow the existing app pattern: users only see their own research jobs; service-role is used only inside trusted routes.

## Source Discovery

Adapter: SearXNG.

Responsibilities:
- generate 3 to 6 search queries from the user topic;
- retrieve 10 to 20 candidate URLs;
- normalize title/url/snippet/source;
- deduplicate by canonical URL;
- classify rough source type;
- store candidate sources before extraction.

V1 should allow the user to deselect sources before the extraction/analysis step.

## Extraction

Adapter: Crawl4AI.

Responsibilities:
- fetch selected URLs;
- extract readable Markdown;
- capture title, metadata, publish date if available;
- fail gracefully per source;
- store extraction errors without failing the entire research job.

V1 should cap extraction length per source and total tokens per job.

## LLM Analysis

Adapter: direct model API or LiteLLM later.

V1 analysis output:
- what is new;
- what matters;
- what is uncertain;
- contradictions between sources;
- risks of hallucination;
- 3 to 5 editorial angles;
- recommended angle with rationale.

Prompt principle:

```text
Do not write the full script first. Analyze sources, identify uncertainty, then propose angles.
```

## Script And Storyboard

The generated storyboard should map to the existing Director shape rather than inventing a second generation pipeline.

Suggested scene item:

```json
{
  "title": "Opening hook",
  "duration_sec": 8,
  "voiceover": "Ideogram just shipped a major update...",
  "visual": "screen capture of the homepage with subtle zoom",
  "asset_prompt": "clean AI product interface, editorial tech style",
  "on_screen_text": "Ideogram update: what changed?"
}
```

`send-to-director` should create a prefilled Create/Director state, not submit a video job automatically in V1.

## Quality Score

Before sending to Director, score:
- hook strength in the first 15 seconds;
- source coverage;
- clarity;
- originality;
- risk / uncertainty disclosure;
- rhythm for the target platform;
- duration fit.

If score is low, the UI should suggest regenerating the angle or script before video creation.

## Watchlists

changedetection.io is Phase 4, not V1.

Good future watchlists:
- official AI company blogs;
- model release pages;
- GitHub releases/trending;
- Hugging Face trending;
- Product Hunt AI;
- competitor pages;
- user-defined product pages.

Webhook candidate:

```ts
POST /api/webhooks/changedetection
```

This should create a draft research job, not auto-generate or publish video.

## Hostinger Deployment Role

Recommended VPS services:

- SearXNG for private/metasearch discovery.
- Crawl4AI for extraction.
- changedetection.io for monitored source changes.
- Speaches/Kokoro for low-cost voice-over experiments.
- Redis or Dragonfly for cache/rate-limit/light queues if needed.
- Uptime Kuma/Dozzle for ops visibility.

Explicitly excluded:
- n8n.
- production Supabase replacement.
- production Next.js migration from Vercel.
- GPU-heavy video/voice models on CPU VPS.

## Phased Roadmap

### T-1100a Spec

This document. Docs-only.

### T-1100b Local/VPS Service Contract

Document env vars, internal URLs, auth, health checks, and failure behavior for SearXNG/Crawl4AI/changetection/Speaches. No app code.

### T-1101 Research Schema

Supabase migration for research tables + RLS. Claude/DB owner preferred.

### T-1102 Research API Skeleton

Create authenticated read/write research job routes, no external calls yet.

### T-1103 Source Discovery Adapter

Add SearXNG integration, normalization, dedupe, tests.

### T-1104 Extraction Adapter

Add Crawl4AI integration, Markdown storage, per-source error handling.

### T-1105 Angles

Generate source summaries, uncertainty notes, contradictions, and editorial angles.

### T-1106 Script And Storyboard

Generate script and Director-compatible storyboard from selected angle.

### T-1107 UI

Add Research Studio surface: job list, source review, angles, script approval, send to Director.

### T-1108 Watchlists

changedetection.io webhook and dashboard notifications.

## Recommended First Build

Start narrower than the attached plan:

```text
topic -> source discovery -> source review -> extraction -> angles -> script -> storyboard
```

Do not start with full automation, publishing, product monitoring, or video generation. The first winning experience is: "I gave AlphoGen a topic, it found real sources, gave me a sharp angle, and produced a storyboard I can approve."

