# Research Discovery Adapter Spec (T-1103)

**Status:** Spec-only, SearXNG integration  
**Owner:** Backend / AlphoResearch (T-1103)  
**Scope:** Transform research_job into candidate sources, no extraction yet  
**Next step:** Implement after spec validation

---

## Overview

T-1103 discovers candidate sources for a research job by querying SearXNG (Hostinger VPS). This adapter:
- Takes a draft/failed research_job
- Queries SearXNG for relevant results
- Inserts research_sources candidates (no extraction yet)
- Marks job as `ready_for_angles` or `failed`

No Crawl4AI extraction, no LLM analysis, no n8n orchestration. Discovery only.

---

## Route

### POST /api/research/jobs/[id]/discover
**Purpose:** Discover sources for a research job

**Auth:** Required (Supabase session)  
**Path param:**
- `id`: UUID

**Request body:** (empty or minimal)
```json
{}
```

**Preconditions:**
- Job owned by user
- Job status = `draft` OR `failed` (for recovery)

**Operation:**
1. Verify ownership and status
2. Update job status → `discovering`
3. Query SearXNG with job topic + input_url
4. Insert research_sources (candidates, no extraction)
5. Update job status → `ready_for_angles` (success) or `failed` (error)

**Response (200):**
```json
{
  "id": "uuid",
  "status": "ready_for_angles",
  "sources_found": 15,
  "error_message": null
}
```

**Errors:**
- 401: No session
- 404: Job not found or non-owned
- 400: Job status not draft/failed (cannot discover)
- 500: SearXNG failure or DB error

---

## SearXNG Contract

### Configuration

**Environment Variables:**
```
RESEARCH_SEARXNG_GATEWAY_URL=https://research-gateway.alphogen.com
RESEARCH_SEARXNG_SERVICE_TOKEN=<32-char hex>
RESEARCH_SEARXNG_TIMEOUT_MS=30000
```

(Gateway URL from Hostinger T-1100b: Caddy/Nginx reverse proxy with TLS + service token auth)

### Query

**Request:**
```json
{
  "q": "topic + input_url if present",
  "engines": ["google", "duckduckgo", "bing"],
  "pageno": 1,
  "format": "json"
}
```

**Response:**
```json
{
  "results": [
    {
      "title": "String",
      "url": "String (canonical)",
      "content": "String (snippet)",
      "engine": "String",
      "category": "news|social media|videos|..."
    }
  ]
}
```

### Quotas & Limits (V1)

| Limit | Value | Rationale |
|-------|-------|-----------|
| Timeout (SearXNG response) | 30s | Hostinger contract |
| Max results per query | 50 | Prevent runaway inserts |
| Max queries per job | 1 | Single search per discovery |
| Max sources per job | 100 | RLS + DB storage |
| Result dedup | Per job + URL | Partial unique index |

### Source Type Heuristic

Classify each result by simple heuristic (no ML):

```
IF url contains github.com/gitlab.com => 'github'
ELSE IF url contains youtube.com/youtu.be => 'youtube'
ELSE IF url contains reddit.com => 'forum'
ELSE IF category = 'news' => 'media'
ELSE IF url contains docs/ OR /documentation => 'docs'
ELSE IF url contains official domain => 'official'
ELSE => 'unknown'
```

No credibility_score yet (V1: null or 0.5 default).

### URL Dedup

- `UNIQUE INDEX (research_job_id, url)` prevents duplicates per job
- SearXNG dedupes across engines; adapter checks DB before insert
- Same URL in different jobs is allowed

---

## Failure Model

### Timeout
- SearXNG response > 30s
- Action: Update job status → `failed`, error_step → `discovery`, error_message → "Source discovery timed out"
- No retry V1

### Partial Results
- SearXNG returns < 5 results
- Action: Accept, insert what we have, continue to `ready_for_angles`
- Warn in logs but don't fail

### Zero Results
- SearXNG returns 0 results
- Action: Update job status → `failed`, error_step → `discovery`, error_message → "No sources found for topic"

### Network Error
- Gateway unreachable / 5xx response
- Action: Update job status → `failed`, error_step → `discovery`, error_message → "SearXNG unavailable"
- No retry V1

### DB Error (insert research_sources)
- Constraint violation, connection lost, etc.
- Action: Rollback, job status → `failed`, error_message logged

---

## Tests Expected

**Route-level tests:**

1. **Auth required**
   - No session → 401

2. **Ownership**
   - Other user's job → 404

3. **Status gate**
   - Job draft → proceed
   - Job failed → proceed
   - Job discovering/extracting/... → 400

4. **SearXNG mock (success)**
   - Mock returns 10 results
   - All inserted as research_sources
   - Job status → `ready_for_angles`
   - Response includes sources_found count

5. **URL dedup**
   - Mock returns duplicate URLs
   - Only unique (job_id, url) inserted
   - research_sources count = unique URLs only

6. **Timeout**
   - Mock SearXNG > 30s delay
   - Job status → `failed`
   - error_step = `discovery`
   - Response 500

7. **Zero results**
   - Mock returns empty results
   - Job status → `failed`
   - error_message "No sources found..."

8. **Partial results**
   - Mock returns 3 results (< 5)
   - Accepted, job → `ready_for_angles`
   - No failure

9. **No external call in tests**
   - SearXNG always mocked
   - No real HTTP to Hostinger
   - No env vars required in test

---

## Non-Goals (V1)

- ❌ Crawl4AI extraction (T-1104)
- ❌ LLM analysis (T-1105)
- ❌ credibility_score computation (V1: null)
- ❌ Automatic retry (timeout → manual re-trigger)
- ❌ n8n orchestration
- ❌ UI (admin dashboard for discovery)
- ❌ Parallel multi-query (single search per job)

---

## Files to Create

- `app/api/research/jobs/[id]/discover/route.ts` — POST discover endpoint
- `app/api/research/jobs/[id]/discover/__tests__/discover.test.ts` — tests
- Spec file: `docs/product/research-discovery-adapter-spec.md` (this file)

---

## Success Criteria

- [ ] POST /api/research/jobs/[id]/discover implemented
- [ ] Auth via Supabase session
- [ ] Ownership verified (404 if non-owned)
- [ ] Status gate: draft/failed only
- [ ] SearXNG call via gateway URL + service token
- [ ] Timeout 30s enforced
- [ ] URL dedup per job (unique index check)
- [ ] Source type heuristic applied
- [ ] Job status updated: discovering → ready_for_angles or failed
- [ ] research_sources inserted (no extraction yet)
- [ ] Failure handling: timeout, zero results, network error
- [ ] Tests: auth, ownership, status, mock, dedup, timeout, partial results
- [ ] No external calls in tests
- [ ] npm test passing, tsc clean, npm build OK

---

## Version History

| Date | Status | Notes |
|------|--------|-------|
| 2026-06-10 | Spec draft | T-1103 source discovery via SearXNG |

---

**Owner:** Backend / AlphoResearch  
**Next:** Implementation (same cycle if spec validated)
