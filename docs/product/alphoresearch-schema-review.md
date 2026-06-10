# AlphoResearch Schema Spec Review

**Status:** Spec for validation (no migration, no code yet)  
**Owner:** Database Architecture / AlphoResearch (T-1101a)  
**Scope:** Document the complete schema, RLS, indexes, constraints before T-1101 migration  
**Next step:** Review + validate together, then migrate (T-1101)

---

## Overview

This document defines the Supabase Cloud schema for AlphoResearch. It captures:
- 5 core tables (research_jobs, research_sources, research_angles, research_scripts, research_storyboards)
- RLS policies (users see only their own research)
- Indexes (performance for discovery queries)
- Constraints (data integrity, size limits)
- Relationships (jobs → sources → angles → scripts → storyboards)

**Principles:**
- Supabase Cloud is the source of truth (no local Postgres, no Hostinger DB)
- Service-role bypass only in trusted API routes (existing app pattern)
- Size limits prevent runaway LLM output storage
- No seeded user data, no n8n orchestration hooks

---

## Table Definitions

### 1. research_jobs

**Purpose:** Root entity for each research session. Tracks status, mode, and user ownership.

```sql
CREATE TABLE public.research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Input
  topic TEXT NOT NULL,
  input_url TEXT,
  
  -- Mode selection
  mode TEXT NOT NULL CHECK (mode IN ('news', 'tutorial', 'product', 'competitor')),
  
  -- Metadata
  language TEXT NOT NULL DEFAULT 'en-US' CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  target_duration_seconds INT CHECK (target_duration_seconds >= 3 AND target_duration_seconds <= 600),
  
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',           -- Created, not started
    'discovering',     -- SearXNG in progress
    'extracting',      -- Crawl4AI in progress
    'ready_for_angles', -- Sources extracted, waiting for angle proposal
    'scripting',       -- Angle selected, script in progress
    'approved',        -- Script approved, ready to send to Director
    'sent_to_director', -- Sent to Create/Director
    'failed'           -- Error in any step
  )),
  
  -- Error tracking
  error_message TEXT,
  error_step TEXT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT user_topic_length CHECK (CHAR_LENGTH(topic) >= 3 AND CHAR_LENGTH(topic) <= 500),
  CONSTRAINT user_url_format CHECK (input_url IS NULL OR input_url ~ '^https?://'),
  CONSTRAINT target_duration_limits CHECK (target_duration_seconds IS NULL OR (target_duration_seconds >= 3 AND target_duration_seconds <= 600))
);

-- Indexes
CREATE INDEX research_jobs_user_id_created_at ON research_jobs(user_id, created_at DESC);
CREATE INDEX research_jobs_status ON research_jobs(status);
CREATE INDEX research_jobs_mode ON research_jobs(mode);

-- RLS
ALTER TABLE research_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_jobs_user_select ON research_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY research_jobs_user_insert ON research_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY research_jobs_user_update ON research_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY research_jobs_user_delete ON research_jobs
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY research_jobs_service_role ON research_jobs
  FOR ALL USING (auth.role() = 'service_role');
```

**Statuses explained:**
- `draft` → User inputs topic/URL, hasn't started discovery
- `discovering` → SearXNG searching for sources
- `extracting` → Crawl4AI extracting content from selected sources
- `ready_for_angles` → Sources ready, LLM to propose 3-5 editorial angles
- `scripting` → User selected angle, generating script + storyboard
- `approved` → User approved script, ready to send to Director
- `sent_to_director` → Handed off to Create/Director for video generation
- `failed` → Error at any step, captured in error_message + error_step

---

### 2. research_sources

**Purpose:** Candidate sources discovered by SearXNG and extracted by Crawl4AI.

```sql
CREATE TABLE public.research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  
  -- Source identification
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  
  -- Source classification
  source_type TEXT NOT NULL DEFAULT 'unknown' CHECK (source_type IN (
    'official',    -- Company/project official site
    'media',       -- News, blog, journalism
    'forum',       -- Discussion forum, Reddit, etc.
    'youtube',     -- Video platform
    'github',      -- GitHub repo, docs
    'docs',        -- Official docs/wiki
    'product',     -- Product page (e.g., ProductHunt)
    'unknown'      -- Unclassified
  )),
  
  -- Quality & relevance
  credibility_score DECIMAL(3, 2) CHECK (credibility_score >= 0 AND credibility_score <= 1.0),
  
  -- Extracted content (size-limited)
  extracted_markdown TEXT CHECK (CHAR_LENGTH(extracted_markdown) <= 51200), -- 50 KB
  
  -- Metadata
  published_at TIMESTAMP WITH TIME ZONE,
  author TEXT,
  
  -- User selection flag
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Extraction status
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN (
    'pending',      -- Not yet extracted
    'success',      -- Successfully extracted
    'failed',       -- Extraction failed (blocked, timeout, parse error)
    'blocked',      -- 403/401 or robots.txt
    'timeout'       -- Took too long
  )),
  extraction_error TEXT,
  extraction_time_ms INT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT url_format CHECK (url ~ '^https?://'),
  CONSTRAINT title_length CHECK (CHAR_LENGTH(title) >= 1 AND CHAR_LENGTH(title) <= 500)
);

-- Indexes
CREATE INDEX research_sources_job_id_selected ON research_sources(research_job_id, selected);
CREATE INDEX research_sources_job_id_status ON research_sources(research_job_id, extraction_status);
CREATE INDEX research_sources_url ON research_sources(url);
CREATE INDEX research_sources_source_type ON research_sources(source_type);

-- Canonical URL dedup (unique per job, prevents duplicate fetches)
CREATE UNIQUE INDEX research_sources_job_url_unique ON research_sources(research_job_id, url);

-- RLS (inherit from research_jobs via job_id)
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_sources_user_select ON research_sources
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_sources.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_sources_user_insert ON research_sources
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_sources.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_sources_user_update ON research_sources
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_sources.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_sources_service_role ON research_sources
  FOR ALL USING (auth.role() = 'service_role');
```

**Size constraints:**
- `extracted_markdown`: 50 KB max (prevents storing 500 KB+ articles)
- Crawl4AI should truncate longer sources; researcher can review full URL manually

**Selection workflow:**
1. SearXNG discovers 10-20 candidate URLs
2. User deselects unwanted sources
3. Crawl4AI extracts only selected sources
4. LLM analyzes content to propose angles

---

### 3. research_angles

**Purpose:** Editorial angles proposed by LLM analysis, user selects one.

```sql
CREATE TABLE public.research_angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  
  -- Angle content
  title TEXT NOT NULL CHECK (CHAR_LENGTH(title) >= 5 AND CHAR_LENGTH(title) <= 200),
  hook TEXT NOT NULL CHECK (CHAR_LENGTH(hook) >= 10 AND CHAR_LENGTH(hook) <= 500),
  positioning TEXT CHECK (positioning IS NULL OR CHAR_LENGTH(positioning) <= 1000),
  
  -- LLM quality scoring
  score DECIMAL(3, 2) CHECK (score >= 0 AND score <= 1.0),
  
  -- User selection (only one per job)
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT one_selected_per_job UNIQUE (research_job_id, selected) WHERE selected = TRUE
);

-- Indexes
CREATE INDEX research_angles_job_id_score ON research_angles(research_job_id, score DESC);
CREATE INDEX research_angles_job_id_selected ON research_angles(research_job_id, selected);

-- RLS (inherit from research_jobs)
ALTER TABLE research_angles ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_angles_user_select ON research_angles
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_angles.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_angles_user_insert ON research_angles
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_angles.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_angles_user_update ON research_angles
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_angles.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_angles_service_role ON research_angles
  FOR ALL USING (auth.role() = 'service_role');
```

**Selection constraint:**
- `UNIQUE (research_job_id, selected) WHERE selected = TRUE`
- Ensures only one angle can be selected per job
- Unenforced: LLM proposes 3-5, user picks best one

---

### 4. research_scripts

**Purpose:** Generated script from selected angle, can be regenerated or edited.

```sql
CREATE TABLE public.research_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  angle_id UUID NOT NULL REFERENCES research_angles(id) ON DELETE CASCADE,
  
  -- Script content (size-limited)
  script TEXT NOT NULL CHECK (CHAR_LENGTH(script) >= 50 AND CHAR_LENGTH(script) <= 10240), -- 10 KB max
  
  -- Structured breakdown (for Director compatibility)
  sections_json JSONB,  -- [{ "section": "intro", "duration_sec": 8, "text": "..." }, ...]
  
  -- Quality metrics
  quality_score DECIMAL(3, 2) CHECK (quality_score >= 0 AND quality_score <= 1.0),
  hook_strength DECIMAL(3, 2),
  source_coverage DECIMAL(3, 2),
  clarity DECIMAL(3, 2),
  originality DECIMAL(3, 2),
  risk_disclosure DECIMAL(3, 2),
  rhythm_fit DECIMAL(3, 2),
  duration_fit DECIMAL(3, 2),
  
  -- User approval
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approval_notes TEXT,
  
  -- Generation metadata
  model_used TEXT,
  tokens_used INT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT script_duration_check CHECK (script ~ '\d+ (second|minute|hour)s?'),
  CONSTRAINT sections_json_size CHECK (CHAR_LENGTH(sections_json::TEXT) <= 5120) -- sections must be reasonable
);

-- Indexes
CREATE INDEX research_scripts_job_id_approved ON research_scripts(research_job_id, approved);
CREATE INDEX research_scripts_quality_score ON research_scripts(quality_score DESC);
CREATE INDEX research_scripts_angle_id ON research_scripts(angle_id);

-- RLS (inherit from research_jobs)
ALTER TABLE research_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_scripts_user_select ON research_scripts
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_scripts.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_scripts_user_insert ON research_scripts
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_scripts.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_scripts_user_update ON research_scripts
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_scripts.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_scripts_service_role ON research_scripts
  FOR ALL USING (auth.role() = 'service_role');
```

**sections_json structure:**
```json
[
  {
    "section": "intro",
    "duration_sec": 8,
    "text": "Anthropic just released Claude 3.5...",
    "voiceover_cues": "Start with energy, mention the date"
  },
  {
    "section": "body",
    "duration_sec": 35,
    "text": "Here's what changed...",
    "sources": ["https://example.com", "..."]
  },
  {
    "section": "outro",
    "duration_sec": 5,
    "text": "Like and subscribe...",
    "call_to_action": "Follow for more AI updates"
  }
]
```

**Quality scores:**
- `hook_strength` (0-1): Hook grabs viewer in first 15 sec?
- `source_coverage` (0-1): Sources cited fairly?
- `clarity` (0-1): Script easy to understand?
- `originality` (0-1): Unique angle or generic?
- `risk_disclosure` (0-1): Uncertainty flagged?
- `rhythm_fit` (0-1): Pacing matches target duration?
- `duration_fit` (0-1): Actual duration close to target?

**Regeneration:**
- User can request new script (different model, temperature, etc.)
- Creates new `research_scripts` row (no deletion, audit trail)

---

### 5. research_storyboards

**Purpose:** Scene-by-scene breakdown compatible with Director/Create.

```sql
CREATE TABLE public.research_storyboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES research_scripts(id) ON DELETE CASCADE,
  
  -- Scenes compatible with Director shape
  scenes_json JSONB NOT NULL,  -- [{ "title": "...", "duration_sec": 8, "voiceover": "...", ... }]
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT scenes_json_not_empty CHECK (jsonb_array_length(scenes_json) > 0),
  CONSTRAINT scenes_json_size CHECK (CHAR_LENGTH(scenes_json::TEXT) <= 102400) -- 100 KB max for full storyboard
);

-- Indexes
CREATE INDEX research_storyboards_job_id ON research_storyboards(research_job_id);
CREATE INDEX research_storyboards_script_id ON research_storyboards(script_id);

-- RLS (inherit from research_jobs)
ALTER TABLE research_storyboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_storyboards_user_select ON research_storyboards
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_storyboards.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_storyboards_user_insert ON research_storyboards
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_storyboards.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_storyboards_service_role ON research_storyboards
  FOR ALL USING (auth.role() = 'service_role');
```

**scenes_json structure:**
```json
[
  {
    "title": "Opening hook",
    "duration_sec": 8,
    "voiceover": "Anthropic just released Claude 3.5...",
    "visual": "screen capture of the homepage with subtle zoom",
    "asset_prompt": "clean AI product interface, editorial tech style",
    "on_screen_text": "Anthropic Update: What's New?",
    "music": "upbeat, minimal",
    "sources": ["https://example.com"]
  },
  {
    "title": "Deep dive: New features",
    "duration_sec": 20,
    "voiceover": "The update includes three major improvements...",
    "visual": "side-by-side comparison or demo video",
    "asset_prompt": "product feature demo, clean UI transitions",
    "on_screen_text": "New Features: Reasoning, Vision, ...",
    "sources": ["https://docs.example.com"]
  },
  ...
]
```

This maps directly to Director scene input; no secondary transformation needed.

---

## Foreign Key Graph

```
research_jobs (root)
  ├── research_sources (job_id)
  │   └── (no children, sources inform angles but don't directly reference them)
  ├── research_angles (job_id)
  │   └── research_scripts (angle_id + job_id)
  │       └── research_storyboards (script_id + job_id)
```

---

## RLS Pattern Explanation

**User perspective:**
- SELECT, INSERT, UPDATE, DELETE only on own jobs (auth.uid() = user_id)
- RLS policy cascades through foreign keys (user can only see sources/angles/scripts for their own jobs)

**Service-role perspective:**
- API routes in Vercel use `supabaseService.from(...)` to bypass RLS
- Create jobs, extract sources, propose angles, generate scripts
- All done with service-role; RLS policy allows everything when role = 'service_role'

**Example policy (research_sources):**
```sql
-- User can only see sources from their own research_jobs
EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_sources.research_job_id AND research_jobs.user_id = auth.uid())
```

This is checked on every SELECT/INSERT/UPDATE/DELETE.

---

## Indexes Summary

| Table | Index | Purpose |
| --- | --- | --- |
| research_jobs | (user_id, created_at DESC) | List user's jobs chronologically |
| research_jobs | (status) | Filter by workflow status |
| research_jobs | (mode) | Filter by research mode |
| research_sources | (job_id, selected) | Quick lookup of selected sources to extract |
| research_sources | (job_id, extraction_status) | Track extraction progress |
| research_sources | (url) | Prevent duplicate URL discovery |
| research_sources | (source_type) | Analytics / filtering by source type |
| research_angles | (job_id, score DESC) | Sort angles by quality |
| research_angles | (job_id, selected) | Find selected angle for scripting |
| research_scripts | (job_id, approved) | Find approved script for storyboard |
| research_scripts | (quality_score DESC) | Sort scripts by quality |
| research_scripts | (angle_id) | Lookup scripts for an angle |
| research_storyboards | (job_id) | Find storyboard for job |
| research_storyboards | (script_id) | Find storyboard for script |

---

## Size Constraints

| Field | Limit | Rationale |
| --- | --- | --- |
| research_jobs.topic | 500 chars | Reasonable user input, prevents spam |
| research_sources.extracted_markdown | 50 KB | Crawl4AI caps per-source; prevents runaway storage |
| research_scripts.script | 10 KB | Full script should fit in ~2000 words |
| research_scripts.sections_json | 5 KB | 3-5 sections is typical, prevents bloat |
| research_storyboards.scenes_json | 100 KB | Full storyboard with all metadata |
| research_jobs.error_message | Text (default) | Unbounded; truncate in app if >1000 chars |

**Quota enforcement (in application, not DB):**
- Max 100 searches per research_job
- Max 20 candidate sources per job
- Max 1 script per angle per job
- Max 1 storyboard per script per job

---

## Integration with Existing App

### Director/Create Compatibility

`send-to-director` endpoint:
1. Read research_storyboards.scenes_json
2. Transform to Director scene payload (minimal or identity transform)
3. POST to `/api/jobs` with prefilled Create/Director state
4. User can review / edit before generation

**Director expects:**
```json
{
  "scenes": [
    {
      "title": "...",
      "duration_sec": 8,
      "prompt": "..."
    }
  ]
}
```

**research_storyboards.scenes_json format is compatible** (add `prompt` from `voiceover` + `asset_prompt` if needed).

### User Records

- research_jobs.user_id always from `auth.uid()` (existing auth pattern)
- No lookup from profiles table needed; auth.users is canonical
- RLS checks auth.uid() at row level

---

## Phase Gates & Future

### V1 (No gates)
- All tables as above
- No quotas enforced in DB (enforced in app)
- No auto-archival of old jobs

### V1+ (Future enhancements, not now)
- Soft-delete: `deleted_at` column to archive jobs
- research_quality_checks: separate table for detailed quality audits
- research_job_versions: track edits to jobs (research_v1, research_v2, etc.)
- Plan-based quotas (table `user_quotas`, enforced via triggers)

---

## Out of Scope (Explicitly)

- ❌ No automatic webhooks to n8n
- ❌ No seeded demo research data
- ❌ No public research publishing (all private to user)
- ❌ No sharing/collaboration between users (V1 single-user per job)
- ❌ No Hostinger-side DB (Supabase Cloud only)
- ❌ No changedetection.io webhooks yet (Phase 4)
- ❌ No analytics table for research quality tracking (future)

---

## Migration Steps (T-1101, after approval)

1. Create all 5 tables with exact column names, types, constraints
2. Create all indexes
3. Enable RLS, create all policies
4. Test RLS with seed data (user A can't see user B's jobs)
5. Test service-role bypass (app routes work)
6. Create initial app routes (empty skeleton, no external calls)
7. Deploy to production

---

## Validation Checklist

Before T-1101 migration, confirm:

- [ ] All 5 tables align with AlphoResearch spec
- [ ] RLS policies prevent cross-user leakage
- [ ] Indexes cover all hot query paths
- [ ] Size constraints prevent storage runaway
- [ ] Foreign keys maintain referential integrity
- [ ] Statuses in research_jobs cover full workflow
- [ ] scenes_json format compatible with Director payload
- [ ] No n8n hooks, no auto-publishing
- [ ] Audit columns (created_at, updated_at) consistent
- [ ] JSON schemas reasonable and documented
- [ ] Test harness can validate policies (Supabase local or staging)

---

## Version History

| Date | Status | Owner | Notes |
| --- | --- | --- | --- |
| 2026-06-10 | Draft for review | Claude | Initial schema spec, no migration yet |

---

**Next:** Review this spec together, validate assumptions, then proceed to T-1101 migration when approved.
