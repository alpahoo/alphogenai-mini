# Research Studio UX Spec

Status: draft for product review  
Owner: Codex / product  
Scope: docs-only, no runtime code, no DB migration

## Intent

Research Studio is the user-facing surface for AlphoResearch. It should feel like a premium editorial control room:

```text
brief -> sources -> angles -> script -> storyboard -> send to Director
```

The product promise is not "auto-post for me." The promise is: "Give me a sourced, strategic video plan I can approve and produce."

## Placement

Recommended navigation:

- Sidebar: `Research`
- Home command center CTA: `Research a video`
- Create flow secondary CTA: `Start from research`

V1 route candidates:

```text
/research
/research/[id]
```

`/research` is the job list and new brief entry. `/research/[id]` is the step-by-step workspace.

## Information Architecture

### Research List

Purpose: manage drafts and recent research jobs.

Visible elements:
- hero header: `Research Studio`
- primary action: `New research`
- filters: All, Drafts, Ready for angle, Script ready, Sent to Director
- rows/cards:
  - topic/title
  - mode: News, Tutorial, Product, Competitor
  - source count
  - selected angle if any
  - status
  - updated time

Empty state:
- "Turn a topic, URL, product, or trend into a video plan."
- CTA `Start research`

### New Research Brief

Purpose: collect enough context without becoming a long form.

Fields:
- Input type segmented control:
  - Topic
  - URL
  - Product
  - Competitor
- Main input:
  - topic text or URL
- Mode:
  - News / Trend
  - Tutorial
  - Product ad
  - Competitor analysis
- Language
- Target format:
  - YouTube long
  - YouTube short
  - TikTok/Reels
  - Product demo
- Target duration
- Optional angle hint:
  - "Make it skeptical"
  - "Make it beginner-friendly"
  - "Compare with competitors"

Primary action:
- `Find sources`

Secondary action:
- `Add sources manually`

Cost visibility:
- show rough quota/cost before source discovery.
- do not start crawl/LLM analysis silently.

## Workspace Layout

Use a left-to-right editorial pipeline with persistent progress:

```text
Brief | Sources | Angles | Script | Storyboard | Director
```

Desktop layout:
- left rail: step progress + job metadata
- main pane: active step
- right rail: quality/readiness, sources summary, cost/quota, warnings

Mobile layout:
- top step tabs
- single-column active step
- sticky bottom action bar

## Step 1: Brief

User can edit:
- topic/input URL
- mode
- language
- target duration
- target platform
- angle hint

State:
- `draft`
- action: `Find sources`

Warnings:
- URL unreachable
- unsupported URL type
- topic too broad

## Step 2: Sources

Purpose: make the research credible and user-controlled.

Sections:
- discovered sources
- manual sources
- failed sources

Source card:
- title
- domain
- source type: Official, Media, Docs, GitHub, Forum, YouTube, Product, Unknown
- snippet
- publish date if available
- credibility indicator
- extraction status
- selected toggle

Actions:
- `Extract selected`
- `Add URL`
- `Remove`
- `Open source`
- `Retry extraction`

V1 rule:
- User must keep at least 2 selected sources for web-based research.
- Manual-source-only mode is allowed for Free plan or when services are down.

Failure behavior:
- Source discovery down: show manual URL entry.
- Extraction failed for one source: keep job alive and mark the source failed.
- Too many sources: ask user to narrow selection.

## Step 3: Angles

Purpose: avoid generic scripts.

Angle card:
- title
- hook
- positioning
- why it matters
- source support count
- uncertainty/risk notes
- fit score

Actions:
- `Select angle`
- `Regenerate angles`
- `Make more skeptical`
- `Make more viral`
- `Make more educational`

Do not generate script before angle selection unless user explicitly asks.

Right rail:
- contradictions found
- uncertain claims
- missing source types

## Step 4: Script

Purpose: produce a user-editable script grounded in selected sources and angle.

Script editor:
- sectioned script
- estimated duration
- hook indicator
- citation/source chips per section
- editable copy

Actions:
- `Improve hook`
- `Shorten`
- `Make more conversational`
- `Add source citations`
- `Approve script`

Quality score:
- hook strength
- clarity
- source coverage
- originality
- risk/uncertainty disclosure
- platform rhythm
- duration fit

If score is below threshold:
- recommend improving angle or script before storyboard.

## Step 5: Storyboard

Purpose: convert the script into Director-compatible scenes.

Scene row:
- scene number
- title
- duration
- voiceover
- visual direction
- asset prompt
- on-screen text
- source chips
- risk notes

Actions:
- edit scene
- split scene
- merge scene
- regenerate visuals for one scene
- approve storyboard

V1 should not generate video here. It prepares the Director payload.

## Step 6: Send To Director

Purpose: bridge Research Studio to existing Create/Director without a second generation pipeline.

CTA:
- `Send to Director`

Expected behavior:
- Create a prefilled Director/Create state with:
  - original topic
  - selected angle
  - approved script
  - storyboard scenes
  - references to selected sources
  - target format/duration

V1 options:
- query/session handoff if no DB state exists yet;
- later: persisted `research_storyboards` linked to create flow.

Non-goal:
- No direct `POST /api/jobs` from Research Studio in V1.

## Premium UX Principles

- Media/editorial, not spreadsheet.
- Keep source credibility visible.
- Make uncertainty explicit.
- Make cost/quota visible before expensive steps.
- Keep approvals explicit.
- Avoid long technical provider names in user-facing copy.
- Prefer "Research", "Extract", "Angle", "Script", "Storyboard", "Director" language.

## States

Job statuses:

```text
draft
discovering_sources
sources_ready
extracting_sources
sources_extracted
angles_ready
script_ready
script_approved
storyboard_ready
sent_to_director
failed
```

Step-level statuses:

```text
idle
running
ready
needs_review
failed
skipped
```

## Access And Plans

Suggested product gates:

- Free:
  - manual sources only
  - 3 research jobs/month
  - no watchlists
- Creator:
  - discovery + extraction
  - limited monthly research jobs
  - script + storyboard
- Pro:
  - watchlists
  - product/competitor modes
  - higher source limits
- Agency:
  - team review
  - brand research profiles
  - multi-brand watchlists

Exact numbers should be decided after service cost testing.

## Integration With Existing Product

### Create Flow

Add "Start from research" entry point after Research Studio exists.

### Director

Director receives scenes, not raw research internals.

### Library

Research outputs can later appear as "Briefs" or "Storyboards", but not V1.

### UGC Studio

Product mode can later hand off product benefits/objections into UGC Studio.

## Non-Goals V1

- No n8n.
- No auto-publishing.
- No automatic video generation.
- No background trend bot that spends credits silently.
- No public scrape endpoint.
- No promise that every source is fully reliable.
- No storage of full copyrighted articles beyond extracted snippets/limited Markdown caps.

## First Build Recommendation

Build the UX around a single happy path:

```text
Topic -> Discover sources -> Select sources -> Generate angles -> Select angle -> Generate script -> Approve script -> Generate storyboard -> Send to Director
```

Then expand to URL/product/competitor modes once the loop feels good.

