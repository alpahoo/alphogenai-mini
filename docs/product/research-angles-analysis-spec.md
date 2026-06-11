# Research Angles Analysis Spec (T-1105)

**Status:** Spec-only, LLM-driven angle generation  
**Owner:** Backend / AlphoResearch (T-1105)  
**Scope:** Generate 3-5 editorial angles from extracted sources via LLM, no script/storyboard yet  
**Next step:** Implement after spec validation

---

## Overview

T-1105 analyzes extracted sources and generates editorial angles using LLM. This adapter:
- Takes a `ready_for_angles` research_job with ≥1 extracted source
- Constructs a LLM prompt from job metadata + extracted Markdown
- Calls LLM (Claude, OpenAI, etc.) to generate 3-5 angles
- Stores angles in research_angles table (no selected angle yet)
- Updates job status → `ready_for_script` or stays `ready_for_angles`

No script generation, no storyboard, no n8n. Angles only.

---

## Route

### POST /api/research/jobs/[id]/analyze
**Purpose:** Generate editorial angles from research sources via LLM

**Auth:** Required (Supabase session)  
**Path param:**
- `id`: UUID

**Request body:** (empty or minimal)
```json
{}
```

**Preconditions:**
- Job owned by user
- Job status = `ready_for_angles` (normal flow) OR `failed` with error_step ≠ `analysis` (recovery)
- At least 1 research_source with extraction_status = `success` and non-null extracted_markdown

**Operation:**
1. Verify ownership and status
2. Fetch all sources with extraction_status = success
3. Validate ≥1 source with extracted_markdown
4. Update job status → `analyzing`
5. Build LLM prompt (topic, mode, sources, user-facing context)
6. Call LLM (provider selected server-side)
7. Parse JSON response → extract 3-5 angles
8. Validate angles (title, hook, positioning, score 0..1)
9. Insert research_angles rows
10. Update job status → `ready_for_script` or `ready_for_angles` (per schema)

**Response (200):**
```json
{
  "id": "uuid",
  "status": "ready_for_script",
  "angles_generated": 4,
  "error_message": null
}
```

**Errors:**
- 401: No session
- 404: Job not found or non-owned
- 400: Job status not ready_for_angles or failed (cannot analyze)
- 422: Zero valid sources (cannot generate angles)
- 500: LLM failure or DB error

---

## LLM Contract

### Configuration

**Environment Variables:**
```
RESEARCH_LLM_PROVIDER=anthropic        # or openai, together, etc.
RESEARCH_LLM_API_KEY=<key>             # Provider API key (server-side only)
RESEARCH_LLM_MODEL=claude-opus-4-8     # Model identifier
RESEARCH_LLM_TIMEOUT_MS=30000          # Request timeout
RESEARCH_LLM_MAX_TOKENS=2000           # Response token budget
```

(No provider names exposed to user-facing responses)

### Prompt Construction

**System message:**
```
You are an editorial angles expert. Generate 3-5 unique, compelling angles for a video/article based on research sources.

Each angle should offer a distinct perspective or approach to the topic, suitable for video/content production.

Return ONLY valid JSON. Do not include markdown, code blocks, or explanations outside the JSON.
```

**User message template:**
```
Topic: {job.topic}
Content Mode: {job.mode} (e.g., news, tutorial, product review, competitive analysis)
Target Audience: Content creators interested in {job.topic}

Extracted Sources Summary:
{concat(source.title + ": " + source.extracted_markdown for top 5 sources by recency, truncate each to 500 chars)}

Generate 3-5 editorial angles as JSON array:
[
  {
    "title": "Angle title (short, catchy)",
    "hook": "Opening hook for viewers/readers (1-2 sentences)",
    "positioning": "Unique positioning vs. other content (2-3 sentences)",
    "score": 0.85
  }
]

Ensure titles are unique, hooks are compelling, and scores reflect content quality/novelty (0.0=poor, 1.0=excellent).
```

### Input Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Timeout per request | 30s | Production LLM contract |
| Max token response | 2000 | Cost control |
| Source excerpt length | 500 chars each | Context window fit |
| Max sources in prompt | 5 top sources | Token budget |
| Angles per job | 3-5 | Editorial diversity |

### Response Contract

**Expected JSON:**
```json
[
  {
    "title": "String (max 100 chars)",
    "hook": "String (max 300 chars)",
    "positioning": "String (max 500 chars)",
    "score": 0.75
  }
]
```

**Validation rules:**
- Array length: 3-5 elements
- Each angle has title, hook, positioning, score
- score: number, 0.0-1.0 (clamp if outside range)
- title: non-empty, unique per job
- hook: non-empty, max 300 chars
- positioning: non-empty, max 500 chars

**On error (LLM returns invalid JSON or error message):**
- Parse fails → treat as single error response
- No fallback angles generated
- Job marked failed with error_step = "analysis"

---

## Data Model: research_angles

**Columns (must exist from T-1101):**
```sql
id UUID PRIMARY KEY
research_job_id UUID NOT NULL (foreign key → research_jobs)
user_id UUID NOT NULL (foreign key → users)
title VARCHAR(100) NOT NULL
hook TEXT NOT NULL
positioning TEXT NOT NULL
score FLOAT (0.0-1.0)
selected BOOLEAN DEFAULT FALSE
created_at TIMESTAMP DEFAULT now()
updated_at TIMESTAMP DEFAULT now()
```

**Unique constraints:**
- `UNIQUE(research_job_id, title)` — one title per job

**Partial unique index:**
- `UNIQUE(research_job_id) WHERE selected=TRUE` — only one selected angle per job (T-1101a spec)

---

## Failure Model

### Zero Valid Sources
- No research_sources with extraction_status = success AND extracted_markdown NOT NULL
- Action: Return 422, don't call LLM, job status → `failed`, error_step → `analysis`

### LLM Timeout
- Request > 30s
- Action: Job status → `failed`, error_step → `analysis`, error_message → "LLM request timed out"

### LLM API Error
- 401 (unauthorized), 429 (rate limited), 5xx (server error)
- Action: Job status → `failed`, error_step → `analysis`, error_message → "LLM provider error"

### Invalid JSON Response
- LLM returns non-JSON, malformed JSON, or invalid structure
- Action: Job status → `failed`, error_step → `analysis`, error_message → "Invalid angles format from LLM"
- No retry V1 (may implement in V2)

### Invalid Angles Data
- LLM returns JSON but missing required fields (title, hook, positioning, score)
- Action: Validate each angle, skip invalid ones
- If < 3 valid angles after cleanup, mark job `failed`
- If ≥ 3 valid angles, insert and mark job `ready_for_script`

### Job Status Gate
- If job.status = `analyzing` when request arrives → 400 (already analyzing)
- If job.status = `failed` with error_step = `analysis` → allow recovery (re-analyze)
- If job.status = `failed` with error_step ≠ `analysis` → 400 (failed for other reason)

---

## Implementation Pattern

### Sequential Angle Generation (V1)

```
1. Fetch job
2. Verify status (ready_for_angles or failed with recovery allowed)
3. Fetch all sources with extraction_status = success
4. Filter sources with non-null extracted_markdown
5. If count(sources) < 1 → return 422 (no valid sources)

6. Update job.status = analyzing

7. Build prompt:
   - Topic: job.topic
   - Mode: job.mode
   - Content: concat(top 5 sources, truncate each to 500 chars)

8. Call LLM (provider, model, timeout, max_tokens from env)

9. Parse response JSON:
   - Try JSON.parse()
   - If fail → error, job.status = failed
   - If success → extract array

10. Validate angles:
    - Array length 3-5
    - Each has title, hook, positioning, score
    - Clamp score to [0.0, 1.0]
    - Skip invalid angles

11. If < 3 valid → job.status = failed, error_step = analysis

12. Insert valid angles into research_angles
    - Set selected = FALSE for all

13. Update job.status = ready_for_script (or ready_for_angles if schema requires)
```

**No parallel LLM calls (V1):** One request per job. Scales via batch queue later.

---

## Tests Expected

**Route-level tests:**

1. **Auth required**
   - No session → 401

2. **Ownership**
   - Other user's job → 404

3. **Status gate**
   - Job ready_for_angles → proceed
   - Job failed (error_step=analysis) → proceed (recovery)
   - Job failed (error_step=discovery) → 400
   - Job analyzing → 400

4. **Zero valid sources**
   - No sources with extraction_status=success → 422
   - No extracted_markdown in sources → 422

5. **LLM mock (success)**
   - Mock returns valid 4 angles JSON
   - All inserted into research_angles with selected=FALSE
   - Job status → `ready_for_script`
   - Response includes angles_generated count

6. **LLM mock (invalid JSON)**
   - Mock returns malformed JSON or text
   - Job status → `failed`
   - error_step = `analysis`
   - Response 500

7. **Score clamping**
   - Mock returns angles with score > 1.0 and score < 0.0
   - Stored clamped to [0.0, 1.0]
   - Insertion succeeds

8. **Angle validation (partial success)**
   - Mock returns 5 angles: 1 missing hook, 4 valid
   - 4 valid inserted, 1 skipped
   - Job status → `ready_for_script` (≥3 valid)

9. **Too few valid angles**
   - Mock returns 2 valid angles (< 3 minimum)
   - Job status → `failed`
   - error_step = `analysis`

10. **LLM timeout**
    - Mock delays > 30s
    - Job status → `failed`
    - error_message contains "timed out"

11. **Prompt construction**
    - Verify topic, mode, source excerpts included
    - No provider names visible in prompt
    - Source truncation to 500 chars per source

12. **No external calls in tests**
    - LLM always mocked
    - No real API calls
    - No env vars required

---

## Status Machine Impact

**Current state (from T-1104):**
- Job can be in: draft, discovering, ready_for_angles, extracting, failed, ...

**After T-1105:**
- ready_for_angles → (analyzing) → ready_for_script OR failed

**Note:** If T-1101 schema defines status as ENUM, verify `ready_for_script` is allowed. If not, use `ready_for_angles` (no status change after analysis) and flag for next phase.

---

## Non-Goals (V1)

- ❌ LLM provider selection per user (fixed server-side)
- ❌ Multi-round angle refinement (single LLM call)
- ❌ Automatic angle selection (user does in UI later)
- ❌ Script generation (T-1106)
- ❌ Storyboard generation (T-1106)
- ❌ n8n orchestration
- ❌ Caching LLM responses per topic
- ❌ UI for angle editing (admin dashboard)

---

## Files to Create

- `app/api/research/jobs/[id]/analyze/route.ts` — POST analyze endpoint
- `app/api/research/jobs/[id]/analyze/__tests__/analyze.test.ts` — tests
- `lib/research/angles.ts` — Pure helper (buildPrompt, validateAngles, callLLM, etc.)
- Spec file: `docs/product/research-angles-analysis-spec.md` (this file)

**No migration needed** if `research_angles` table already has all required columns (id, research_job_id, user_id, title, hook, positioning, score, selected, created_at, updated_at). Verify schema before implementing.

---

## Success Criteria

- [ ] POST /api/research/jobs/[id]/analyze implemented
- [ ] Auth via Supabase session
- [ ] Ownership verified (404 if non-owned)
- [ ] Status gate: ready_for_angles or failed (error_step ≠ analysis)
- [ ] Zero valid sources detection (422)
- [ ] LLM call via provider (env-based, server-side only)
- [ ] Timeout 30s enforced
- [ ] JSON parsing with error handling
- [ ] Angle validation: title, hook, positioning, score 0..1
- [ ] Score clamping [0.0, 1.0]
- [ ] Insert 3-5 angles into research_angles (selected=FALSE)
- [ ] Job status updated: analyzing → ready_for_script or failed
- [ ] Failure handling: timeout, API error, invalid JSON, too few valid
- [ ] Tests: auth, ownership, status, zero sources, LLM mock, JSON errors, score clamp, validation
- [ ] No external calls in tests
- [ ] npm test passing, tsc clean, npm build OK

---

## Version History

| Date | Status | Notes |
|------|--------|-------|
| 2026-06-11 | Spec draft | T-1105 angles analysis via LLM |

---

**Owner:** Backend / AlphoResearch  
**Next:** Implementation (same cycle if spec validated)
