# Research Extraction Adapter Spec (T-1104)

**Status:** Spec-only, Crawl4AI integration  
**Owner:** Backend / AlphoResearch (T-1104)  
**Scope:** Extract Markdown from candidate sources, populate extracted_markdown field  
**Next step:** Implement after spec validation

---

## Overview

T-1104 extracts article content from discovered sources using Crawl4AI (Hostinger VPS). This adapter:
- Takes a `ready_for_angles` research_job with sources
- Extracts Markdown from each source URL
- Stores extracted_markdown + extraction_status per source
- Updates job status → `ready_for_angles` (if ≥1 success) or `failed` (if 0 success)

No LLM, no angles generation, no n8n orchestration. Extraction only.

---

## Route

### POST /api/research/jobs/[id]/extract
**Purpose:** Extract Markdown content from research sources

**Auth:** Required (Supabase session)  
**Path param:**
- `id`: UUID

**Request body:** (empty or minimal)
```json
{}
```

**Preconditions:**
- Job owned by user
- Job status = `ready_for_angles` (normal flow) OR `failed` with error_step ≠ `extraction` (recovery)

**Operation:**
1. Verify ownership and status
2. Update job status → `extracting`
3. Fetch research_sources for job_id
4. Call Crawl4AI for each source (up to 100 per job quota)
5. Store extracted_markdown, extraction_status, extraction_error per source
6. Update job status → `ready_for_angles` (if ≥1 success) or `failed` (if 0 success)

**Response (200):**
```json
{
  "id": "uuid",
  "status": "ready_for_angles",
  "sources_extracted": 8,
  "sources_failed": 2,
  "error_message": null
}
```

**Errors:**
- 401: No session
- 404: Job not found or non-owned
- 400: Job status not ready_for_angles or failed (cannot extract)
- 500: Crawl4AI failure or DB error

---

## Crawl4AI Contract

### Configuration

**Environment Variables:**
```
RESEARCH_CRAWL4AI_GATEWAY_URL=https://extract-gateway.alphogen.com
RESEARCH_CRAWL4AI_SERVICE_TOKEN=<32-char hex>
RESEARCH_CRAWL4AI_TIMEOUT_MS=15000
RESEARCH_CRAWL4AI_MAX_MARKDOWN_KB=50
```

(Gateway URL from Hostinger T-1100b: Caddy/Nginx reverse proxy with TLS + service token auth)

### Extraction Request

**Request:**
```json
{
  "url": "https://example.com/article",
  "timeout_ms": 15000,
  "format": "markdown"
}
```

**Response:**
```json
{
  "success": true,
  "markdown": "# Article Title\n\n...",
  "char_count": 5432,
  "extraction_time_ms": 3200,
  "error": null
}
```

**On error:**
```json
{
  "success": false,
  "markdown": null,
  "char_count": 0,
  "extraction_time_ms": 15050,
  "error": "timeout" | "blocked" | "invalid_url" | "parsing_error" | "server_error"
}
```

### Quotas & Limits (V1)

| Limit | Value | Rationale |
|-------|-------|-----------|
| Timeout per source | 15s | Hostinger contract |
| Max markdown size | 50 KB | Storage + processing |
| Max sources per job | 100 | Research scope limit |
| Max concurrent extracts | 1 per job | Sequential processing V1 |
| Retries | 0 (V1) | No retry logic yet |

### Error Categories

- **timeout**: Crawl4AI response > 15s
- **blocked**: HTTP 403/429/robots.txt
- **invalid_url**: Malformed URL, non-http(s)
- **parsing_error**: HTML parse failure, no content found
- **server_error**: 5xx response, gateway unavailable

---

## Data Model: research_sources Extensions

**Columns added (migration not required if schema already supports):**
```sql
extracted_markdown TEXT NULL           -- Markdown content (max 50 KB)
extraction_status VARCHAR(50)          -- pending | extracting | success | timeout | blocked | parsing_error | error
extraction_error TEXT NULL             -- Error message (e.g., "Timeout after 15000ms")
extraction_time_ms INT NULL            -- Wall-clock time in milliseconds
```

**Status values:**
- `pending`: Not yet extracted (initial state)
- `extracting`: Extraction in progress
- `success`: Extraction completed, markdown stored
- `timeout`: Crawl4AI timeout
- `blocked`: HTTP 403/429
- `parsing_error`: No content extracted
- `error`: Server error or other failure

---

## Failure Model

### Timeout
- Crawl4AI response > 15s
- Action: Mark source `extraction_status = 'timeout'`, store error, continue to next source
- No retry V1

### Blocked (403/429)
- HTTP Forbidden or Too Many Requests
- Action: Mark source `extraction_status = 'blocked'`, continue
- Suggests rate limiting; no automatic retry

### Parsing Error
- HTML downloaded but no extractable content
- Action: Mark source `extraction_status = 'parsing_error'`, continue

### Network / Server Error
- Gateway unreachable, 5xx response
- Action: Mark source `extraction_status = 'error'`, continue
- No retry V1

### Partial Success
- 8 sources extracted successfully, 2 failed
- Action: Continue to `ready_for_angles`, inform user in UI (future)

### Zero Success
- All sources timeout, blocked, or fail
- Action: Update job status → `failed`, error_step → `extraction`, error_message → "No sources could be extracted"

### Job Status Gate
- If job.status = `extracting` when request arrives → 400 (already extracting)
- If job.status = `failed` with error_step = `extraction` → allow recovery (re-extract)
- If job.status = `failed` with error_step ≠ `extraction` → 400 (failed for other reason)

---

## Implementation Pattern

### Sequential Extraction (V1)
```
for each source in research_sources:
  try:
    result = await Crawl4AI(source.url, timeout=15s)
    if result.success:
      UPDATE research_sources
        SET extracted_markdown = result.markdown,
            extraction_status = 'success',
            extraction_time_ms = result.extraction_time_ms
      success_count += 1
    else:
      UPDATE research_sources
        SET extracted_markdown = NULL,
            extraction_status = result.error,
            extraction_error = result.error_message,
            extraction_time_ms = result.extraction_time_ms
  catch err:
    UPDATE research_sources
      SET extraction_status = 'error',
          extraction_error = err.message

if success_count >= 1:
  UPDATE research_jobs SET status = 'ready_for_angles'
else:
  UPDATE research_jobs SET status = 'failed', error_step = 'extraction', error_message = '...'
```

**No parallel extraction (V1):** One request at a time. Scales via job queue later.

---

## Tests Expected

**Route-level tests:**

1. **Auth required**
   - No session → 401

2. **Ownership**
   - Other user's job → 404

3. **Status gate**
   - Job ready_for_angles → proceed
   - Job failed (error_step=extraction) → proceed (recovery)
   - Job failed (error_step=discovery) → 400
   - Job extracting → 400

4. **Crawl4AI mock (success)**
   - Mock returns markdown for 3 sources
   - All stored with extraction_status = success
   - Job status → `ready_for_angles`
   - Response includes sources_extracted count

5. **Markdown truncation**
   - Mock returns 75 KB markdown
   - Stored truncated to 50 KB
   - extraction_status = success (truncation is not an error)

6. **Partial failures**
   - Mock: 2 sources success, 1 timeout, 1 blocked
   - All marked with correct status
   - Job status → `ready_for_angles` (≥1 success)
   - sources_extracted = 2, sources_failed = 2

7. **Timeout per source**
   - Mock: first source times out
   - extraction_status = timeout, continue to next
   - No job-level timeout, just mark source

8. **Zero success**
   - Mock: all sources fail/timeout/blocked
   - Job status → `failed`
   - error_step = `extraction`
   - error_message = "No sources could be extracted"

9. **No external calls in tests**
   - Crawl4AI always mocked
   - No real HTTP to Hostinger
   - No env vars required in test

10. **DB constraints**
    - Sources linked by (job_id, source_id)
    - No duplicate extraction per source per job (idempotent)
    - extraction_status enum enforced at app level (DB TEXT column)

---

## Non-Goals (V1)

- ❌ Parallel extraction (sequential only)
- ❌ Retry on timeout/blocked (one attempt per source)
- ❌ LLM summarization (T-1105)
- ❌ Angle generation (T-1105)
- ❌ Content dedup across sources
- ❌ Language detection / multi-language support
- ❌ Boilerplate removal (keep full HTML-parsed markdown)
- ❌ Link canonicalization
- ❌ n8n orchestration
- ❌ UI (admin dashboard for extraction status)

---

## Files to Create

- `app/api/research/jobs/[id]/extract/route.ts` — POST extract endpoint
- `app/api/research/jobs/[id]/extract/__tests__/extract.test.ts` — tests
- `lib/research/extraction.ts` — Pure helper (callCrawl4AI, normalizeError, etc.)
- Spec file: `docs/product/research-extraction-adapter-spec.md` (this file)

**No migration needed** if `research_sources` table already has `extracted_markdown`, `extraction_status`, `extraction_error`, `extraction_time_ms` columns. Verify schema before implementing.

---

## Success Criteria

- [ ] POST /api/research/jobs/[id]/extract implemented
- [ ] Auth via Supabase session
- [ ] Ownership verified (404 if non-owned)
- [ ] Status gate: ready_for_angles or failed (error_step ≠ extraction)
- [ ] Crawl4AI call via gateway URL + service token
- [ ] Timeout 15s enforced per source
- [ ] Markdown truncation to 50 KB
- [ ] extraction_status stored per source (success/timeout/blocked/parsing_error/error)
- [ ] Job status updated: extracting → ready_for_angles OR failed
- [ ] Failure handling: timeout, blocked, parsing errors, network errors
- [ ] Partial success accepted (job ready_for_angles if ≥1 success)
- [ ] Zero success → job failed with error_step = extraction
- [ ] Tests: auth, ownership, status, mock, truncation, partial failures, zero success
- [ ] No external calls in tests
- [ ] npm test passing, tsc clean, npm build OK

---

## Version History

| Date | Status | Notes |
|------|--------|-------|
| 2026-06-11 | Spec draft | T-1104 extraction via Crawl4AI |

---

**Owner:** Backend / AlphoResearch  
**Next:** Implementation (same cycle if spec validated)
