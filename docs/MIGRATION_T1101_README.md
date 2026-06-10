# T-1101 Migration: AlphoResearch Schema

**Status:** Ready for manual application  
**Migration file:** `supabase/migrations/001_create_alphoresearch_schema.sql`  
**Project ID:** `qbrpzmuedfugbhoeytdj`  
**Validation:** Aligns with T-1101a spec review  

---

## Overview

This migration creates the complete AlphoResearch database schema:

**Tables (5):**
- `research_jobs` — Root entity for research sessions
- `research_sources` — Discovered sources
- `research_angles` — Proposed editorial angles
- `research_scripts` — Generated scripts
- `research_storyboards` — Scene breakdowns (Director-compatible)

**Features:**
- Row-level security (RLS) with user ownership checks
- Partial unique index for single-selected angle enforcement
- JSON validation constraints (sections_json, scenes_json)
- Size limits (50 KB sources, 10 KB scripts, 100 KB storyboards)
- Comprehensive indexes for performance
- Foreign key cascading

---

## How to Apply

### Option 1: Via Supabase Console (Recommended)

1. Log in to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: **alphogenai-mini** (EU, qbrpzmuedfugbhoeytdj)
3. Navigate to **SQL Editor**
4. Open a new query
5. Copy the entire SQL from `supabase/migrations/001_create_alphoresearch_schema.sql`
6. Paste into the editor
7. Click **Run** (or ⌘/Ctrl + Enter)
8. Confirm all 5 tables created ✓

### Option 2: Via Supabase CLI (Local)

```bash
cd /path/to/alphogenai-mini
supabase migrations up
```

This will run all migrations in `supabase/migrations/` against the remote project (requires `SUPABASE_ACCESS_TOKEN`).

### Option 3: Via psql (Direct DB)

```bash
psql "postgresql://postgres.qbrpzmuedfugbhoeytdj:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require" < supabase/migrations/001_create_alphoresearch_schema.sql
```

(Password available in `.vercel/.env.production.local` as `SUPABASE_POSTGRES_PASSWORD`)

---

## Validation After Migration

### 1. Tables Created
In Supabase Console > Table Editor, verify:
```
✓ public.research_jobs
✓ public.research_sources
✓ public.research_angles
✓ public.research_scripts
✓ public.research_storyboards
```

### 2. RLS Enabled
For each table, check **Row Level Security** is enabled:
```bash
SELECT tablename FROM pg_tables WHERE tablename LIKE 'research_%' AND schemaname = 'public';
SELECT tablename FROM pg_tables WHERE rowsecurity = true AND schemaname = 'public';
```

### 3. Sample Policy Check
Run in SQL Editor:
```sql
SELECT polname, permissive, cmd FROM pg_policies WHERE tablename = 'research_jobs';
```

Should show ~4 policies: SELECT, INSERT, UPDATE, DELETE (all user ownership-based).

### 4. Indexes Verified
```sql
SELECT indexname FROM pg_indexes WHERE tablename LIKE 'research_%' AND schemaname = 'public' ORDER BY indexname;
```

Key indexes to verify:
- `research_angles_job_id_selected_partial` (partial unique)
- `research_sources_job_url_unique` (canonical URL dedup)
- `research_jobs_user_id_created_at` (user timeline)

### 5. Constraints Verified
```sql
SELECT tablename, conname FROM pg_constraint WHERE tablename LIKE 'research_%' AND contype = 'c' ORDER BY tablename, conname;
```

Should include jsonb_typeof checks, size limits, regex validation, etc.

---

## Rollback (If Needed)

If validation fails, rollback by dropping all tables:

```sql
DROP TABLE IF EXISTS public.research_storyboards CASCADE;
DROP TABLE IF EXISTS public.research_scripts CASCADE;
DROP TABLE IF EXISTS public.research_angles CASCADE;
DROP TABLE IF EXISTS public.research_sources CASCADE;
DROP TABLE IF EXISTS public.research_jobs CASCADE;
```

Then re-apply the migration after reviewing the error.

---

## Advisor Review (Post-Migration)

After successful migration, run Supabase Advisor to check schema quality:

In Supabase Console:
1. Click **Advisor** (left sidebar)
2. Run checks
3. Review recommendations (typically: missing indexes, RLS improvements)

Our schema is fully optimized; advisor should report minimal issues.

---

## Next Steps

Once T-1101 migration is confirmed:

- T-1102: Research API skeleton (authenticated read/write routes)
- T-1103: Source discovery adapter (SearXNG integration)
- T-1104: Extraction adapter (Crawl4AI)
- T-1105: Angles analysis (LLM summaries)
- T-1106: Script + storyboard generation
- T-1107: Research Studio UI

---

## Reference

- **Spec:** `docs/product/alphoresearch-schema-review.md` (T-1101a)
- **UX:** `docs/product/research-studio-ux-spec.md`
- **Hostinger Contract:** `docs/product/hostinger-service-contract.md` (auxiliary services)
- **Migration SQL:** `supabase/migrations/001_create_alphoresearch_schema.sql`

---

**Owner:** Claude / Database Architecture  
**Date:** 2026-06-10  
**Approval:** Pending manual application + advisor validation
