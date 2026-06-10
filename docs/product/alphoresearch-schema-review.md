# AlphoResearch Schema Spec Review (T-1101a)

**Status:** Docs-only spec for validation (no SQL migration, no runtime code)  
**Owner:** Database Architecture / AlphoResearch (T-1101a)  
**Scope:** Document the complete Supabase schema, RLS policies, indexes, constraints, and edge cases  
**Next step:** Review + validate together, THEN proceed to T-1101 migration

---

## IMPORTANT: This is a specification, not a migration

This document defines the **intended schema** for AlphoResearch. It includes:
- **SQL table DDL** (as reference, not to be run blindly)
- **RLS policies** (WITH CHECK constraints, cascading ownership, service-role bypass)
- **Indexes** (partial unique indexes, covering indexes)
- **Size constraints** (50 KB, 5 KB, 100 KB limits)
- **Edge cases** (canonical URL dedup, single-selected angle, delete cascade)

**DO NOT RUN THESE SQL STATEMENTS YET.** This review phase is for validation and corrections. T-1101 migration will happen after approval.

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
  
  -- Lifecycle (aligns with research-studio-ux-spec.md)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',           -- User editing brief (topic, mode, language, duration)
    'discovering',     -- SearXNG searching for sources
    'extracting',      -- Crawl4AI extracting selected sources
    'ready_for_angles', -- Sources extracted, awaiting angle proposal by LLM
    'scripting',       -- Angle selected, LLM generating script + sections
    'approved',        -- Script approved by user, ready to send to Director
    'sent_to_director', -- Sent to Create/Director for video generation
    'failed'           -- Error at any step (see error_message, error_step)
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
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id  -- Prevent user from changing ownership
    AND (
      -- User can edit draft jobs freely
      (status = 'draft')
      OR
      -- User can update status/error tracking as job progresses (service-role path)
      (auth.role() = 'service_role')
    )
  );

-- NOTE: Delete policies can be user-owned OR service-role-only.
-- V1 choice: Allow users to delete their own jobs (soft-delete via archive in V1+).
CREATE POLICY research_jobs_user_delete ON research_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Service-role bypass: optional, but explicit for clarity.
-- Service-role always bypasses RLS, so this policy is redundant but documented.
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
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_sources.research_job_id AND research_jobs.user_id = auth.uid())
  );

-- User can delete own sources (e.g., deselect before extraction)
CREATE POLICY research_sources_user_delete ON research_sources
  FOR DELETE USING (
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
  
  -- User selection (only one per job via unique partial index)
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
-- Partial unique index: ensures max one angle selected=true per job
CREATE UNIQUE INDEX research_angles_job_id_selected_partial 
  ON research_angles(research_job_id) 
  WHERE selected = TRUE;

-- Lookup indexes for filtering and sorting
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
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_angles.research_job_id AND research_jobs.user_id = auth.uid())
  );

-- User can delete regenerated angles or unselect via DELETE + re-INSERT
CREATE POLICY research_angles_user_delete ON research_angles
  FOR DELETE USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_angles.research_job_id AND research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_angles_service_role ON research_angles
  FOR ALL USING (auth.role() = 'service_role');
```

**Selection constraint (Postgres partial unique index):**
- `CREATE UNIQUE INDEX research_angles_job_id_selected_partial ON research_angles(research_job_id) WHERE selected = TRUE`
- Ensures only one angle can have `selected = TRUE` per job
- Workflow: LLM proposes 3-5 angles, user `UPDATE selected = TRUE` on one, database enforces uniqueness
- If user changes selection: old angle `UPDATE selected = FALSE`, new angle `UPDATE selected = TRUE`

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
  
  CONSTRAINT sections_json_valid CHECK (sections_json IS NULL OR jsonb_typeof(sections_json) = 'array'),
  CONSTRAINT sections_json_size CHECK (sections_json IS NULL OR CHAR_LENGTH(sections_json::TEXT) <= 5120)
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
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_scripts.research_job_id AND research_jobs.user_id = auth.uid())
  );

-- User can delete regenerated scripts (e.g., start over with different angle)
CREATE POLICY research_scripts_user_delete ON research_scripts
  FOR DELETE USING (
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
  
  CONSTRAINT scenes_json_valid CHECK (
    CASE
      WHEN jsonb_typeof(scenes_json) = 'array'
      THEN jsonb_array_length(scenes_json) > 0
      ELSE FALSE
    END
  ),
  CONSTRAINT scenes_json_size CHECK (CHAR_LENGTH(scenes_json::TEXT) <= 102400) -- 100 KB max
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

CREATE POLICY research_storyboards_user_update ON research_storyboards
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_storyboards.research_job_id AND research_jobs.user_id = auth.uid())
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM research_jobs WHERE research_jobs.id = research_storyboards.research_job_id AND research_jobs.user_id = auth.uid())
  );

-- User can delete storyboard and regenerate from script if needed
CREATE POLICY research_storyboards_user_delete ON research_storyboards
  FOR DELETE USING (
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
- WITH CHECK clauses on UPDATE/INSERT prevent user from changing `job_id` or `user_id` (orphaning protection)
- WITH CHECK cascades ownership: user cannot create source for someone else's job

**Service-role perspective:**
- API routes in Vercel use `supabaseService.from(...)` to bypass RLS completely
- Service-role has unrestricted access, regardless of policies
- The explicit `CREATE POLICY ... FOR ALL USING (auth.role() = 'service_role')` is optional/redundant; included for clarity only
- All sensitive operations (SearXNG discovery, Crawl4AI extraction, LLM analysis) happen via service-role routes

**Migration recommendation:**
- Do not generate explicit service-role policies in T-1101 unless there is a proven need.
- Keep RLS policies focused on authenticated user ownership.
- Service-role access is handled by Supabase bypass behavior and should be tested separately.

**Canonical URL dedup (per job):**
- `CREATE UNIQUE INDEX research_sources_job_url_unique ON research_sources(research_job_id, url)`
- Prevents duplicate URL discovery within a single research job
- SearXNG dedupes across engines; index prevents re-inserting the same URL
- Different jobs can have the same URL (e.g., blog post referenced in two research briefs)

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

## T-1101a Corrections Applied (Spec Review)

This version includes corrections from review comments:

1. **UNIQUE WHERE → partial index** ✅  
   Replaced `CONSTRAINT one_selected_per_job UNIQUE WHERE selected=TRUE` with `CREATE UNIQUE INDEX research_angles_job_id_selected_partial ON research_angles(research_job_id) WHERE selected = TRUE`

2. **Removed script_duration_check** ✅  
   Deleted CHECK constraint that was regex-matching on raw text. Scripts are generated; format validation happens in app.

3. **Added WITH CHECK on UPDATE** ✅  
   Added explicit WITH CHECK to jobs, sources, angles, scripts, storyboards UPDATE policies to prevent orphaning or ownership change.

4. **Added DELETE policies** ✅  
   Added user-owned DELETE policies for sources, angles, scripts, storyboards (service-role can always delete via bypass).

5. **Added jsonb_typeof checks** ✅  
   Added `CONSTRAINT sections_json_valid CHECK (jsonb_typeof(sections_json) = 'array')` and same for scenes_json.

6. **Clarified service-role bypass** ✅  
   Documented that service-role bypasses RLS completely; explicit policies are optional but included for clarity.

7. **Aligned statuses with UX spec** ✅  
   Updated status comments to align with research-studio-ux-spec.md (draft → discovering → extracting → ready_for_angles → scripting → approved → sent_to_director).

8. **Clarified canonical URL dedup** ✅  
   Documented partial unique index `(research_job_id, url)` prevents duplicate discovery per job.

9. **Docs-only reminder** ✅  
   Added clear header: this is a spec, not a migration. T-1101 follows after approval.

10. **Migration-readiness addendum** ✅  
   JSON constraints should be null-safe where fields are optional, and T-1101 should omit redundant explicit service-role policies unless needed.

---

## Version History

| Date | Status | Owner | Notes |
| --- | --- | --- | --- |
| 2026-06-10 | Draft for review | Claude | Initial schema spec |
| 2026-06-10 | Spec review corrections | Claude | T-1101a-fix: indexes, WITH CHECK, DELETE, service-role, status alignment |

---

**Next:** Review this corrected spec together, validate assumptions, then proceed to T-1101 migration when approved.
