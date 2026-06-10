# Research API Skeleton Spec (T-1102)

**Status:** Spec-only, no external calls, no UI  
**Owner:** Backend / AlphoResearch (T-1102)  
**Scope:** Authenticated CRUD routes for research_jobs table, minimal validation  
**Next step:** Implement routes after spec validation

---

## Overview

T-1102 implements 4 core API routes for research job management. These are authenticated, user-owned, and stateless—no external service calls (SearXNG, Crawl4AI, LLM). The routes serve as the foundation for Research Studio UI to create, list, read, and edit research briefs.

---

## Routes (V1)

### 1. POST /api/research/jobs
**Purpose:** Create a new research job (draft status)

**Auth:** Required (Supabase session)  
**Request body:**
```json
{
  "topic": "string, 3-500 chars, required",
  "input_url": "string, http/https optional",
  "mode": "enum: news | tutorial | product | competitor, required",
  "language": "string, default en-US, optional (format: [a-z]{2}(-[A-Z]{2})?)",
  "target_duration_seconds": "integer, 3-600, optional"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "user_id": "uuid (from auth.uid())",
  "topic": "string",
  "input_url": "string or null",
  "mode": "string",
  "language": "string",
  "target_duration_seconds": "integer or null",
  "status": "draft",
  "error_message": null,
  "error_step": null,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

**Errors:**
- 400: Invalid topic (length), URL format, mode, language, duration
- 401: No session
- 500: Database error

---

### 2. GET /api/research/jobs
**Purpose:** List all jobs for authenticated user

**Auth:** Required  
**Query params (optional):**
- `limit`: 1-100, default 10
- `offset`: 0+, default 0
- `status`: filter by status (draft, discovering, extracting, ready_for_angles, scripting, approved, sent_to_director, failed)

**Response (200):**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "topic": "string",
      "mode": "string",
      "status": "string",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

**Errors:**
- 401: No session
- 500: Database error

---

### 3. GET /api/research/jobs/[id]
**Purpose:** Fetch a single job by ID

**Auth:** Required  
**Path param:**
- `id`: UUID

**Response (200):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "topic": "string",
  "input_url": "string or null",
  "mode": "string",
  "language": "string",
  "target_duration_seconds": "integer or null",
  "status": "string",
  "error_message": "string or null",
  "error_step": "string or null",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

**Errors:**
- 401: No session
- 404: Job not found OR job not owned by user
- 500: Database error

---

### 4. PATCH /api/research/jobs/[id]
**Purpose:** Edit a draft job

**Auth:** Required  
**Path param:**
- `id`: UUID

**Request body (all optional, but at least one required):**
```json
{
  "topic": "string, 3-500 chars",
  "input_url": "string, http/https",
  "mode": "enum: news | tutorial | product | competitor",
  "language": "string, [a-z]{2}(-[A-Z]{2})?",
  "target_duration_seconds": "integer, 3-600"
}
```

**Validation:**
- Only allows editing if `status = 'draft'`
- Rejects changes if job not in draft state

**Response (200):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "topic": "string",
  "input_url": "string or null",
  "mode": "string",
  "language": "string",
  "target_duration_seconds": "integer or null",
  "status": "draft",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

**Errors:**
- 400: Invalid input OR job not in draft status
- 401: No session
- 404: Job not found OR job not owned by user
- 500: Database error

---

### 5. DELETE /api/research/jobs/[id] (Optional V1)
**Purpose:** Hard-delete a job

**Auth:** Required  
**Status:** Safe for V1 (no soft-delete needed yet)

**Response (200):**
```json
{
  "success": true,
  "id": "uuid"
}
```

**Errors:**
- 401: No session
- 404: Job not found OR not owned
- 500: Database error

---

## Auth & Ownership

**Pattern:**
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return 401;
const user_id = user.id;  // Never trust client-provided user_id

// For service-role routes (if used):
const supabaseService = createClient(url, serviceRoleKey);
const job = await supabaseService
  .from('research_jobs')
  .select()
  .eq('id', jobId)
  .eq('user_id', user_id)  // Always filter by user_id
  .single();
```

**Rules:**
- `user_id` comes from `auth.uid()`, never from client
- Service-role client allowed but only for internal routes
- Always filter queries by `user_id` to enforce ownership
- 404 for missing jobs or ownership mismatch (no leaking existence)

---

## Validation Rules

| Field | Rule | Example |
|-------|------|---------|
| `topic` | 3-500 chars | "Claude 3.5 Release" |
| `input_url` | Optional, must be http/https | "https://example.com" |
| `mode` | Enum: news \| tutorial \| product \| competitor | "news" |
| `language` | Regex: `^[a-z]{2}(-[A-Z]{2})?$`, default en-US | "en-US", "fr", "zh-CN" |
| `target_duration_seconds` | 3-600, optional | 120 |

**PATCH special rule:**
- Only allow edits if `status = 'draft'`
- Return 400 if job status ≠ 'draft'

---

## Non-Goals (V1)

- ❌ No SearXNG integration (T-1103)
- ❌ No Crawl4AI calls (T-1104)
- ❌ No LLM analysis (T-1105)
- ❌ No script/storyboard generation (T-1106)
- ❌ No UI implementation (T-1107)
- ❌ No status auto-transitions (manual only)
- ❌ No data seeding

---

## Tests Expected

**Route-level tests (Supabase mocked):**

1. **Auth required**
   - GET/POST/PATCH/DELETE without session → 401

2. **Ownership enforcement**
   - User A cannot read/edit/delete User B's jobs → 404

3. **Validation**
   - topic < 3 chars → 400
   - topic > 500 chars → 400
   - invalid mode → 400
   - invalid language format → 400
   - duration < 3 or > 600 → 400

4. **Draft-only PATCH**
   - PATCH on draft job → 200
   - PATCH on discovering job → 400

5. **Happy path**
   - POST create → 201, job in draft
   - GET list → 200, returns user's jobs only
   - GET [id] → 200, returns owned job
   - PATCH draft → 200, updates fields
   - DELETE → 200, removes job

---

## File Structure

```
app/api/research/jobs/
  route.ts                    # GET list, POST create
[id]/
  route.ts                    # GET single, PATCH edit, DELETE
__tests__/
  jobs.test.ts               # Route tests with Supabase mocked
```

---

## Success Criteria

- [ ] All 4 routes implemented (DELETE optional)
- [ ] Auth via Supabase session
- [ ] Ownership enforced (user_id filtering)
- [ ] Input validation on topic, mode, language, duration
- [ ] Draft-only PATCH check
- [ ] Route-level tests with mocked Supabase
- [ ] No external calls (SearXNG, Crawl4AI, LLM)
- [ ] TypeScript strict mode clean
- [ ] Errors return proper status codes (401, 404, 400, 500)

---

## Version History

| Date | Status | Notes |
|------|--------|-------|
| 2026-06-10 | Spec draft | T-1102 API skeleton scope |

---

**Owner:** Backend / AlphoResearch  
**Next:** Implementation (same cycle if spec validated)
