# Research Script + Storyboard Generation Spec (T-1106)

**Status:** Spec-only, LLM-driven script + Director-compatible storyboard
**Owner:** Backend / AlphoResearch (T-1106)
**Scope:** From a selected angle → generate one research_script + one research_storyboard. No UI, no video generation.
**Next step:** Implement after spec validation

---

## Overview

T-1106 takes the angle the user selected (`selected = TRUE`) and generates:
1. A complete **research_script** (full text + structured sections + quality subscores)
2. A **research_storyboard** with scenes compatible with the Director `scenes[]` shape

No video generation, no UI, no n8n. Script + storyboard rows only.

---

## Schema Facts (from T-1101 migration — verified, do NOT re-derive)

These constraints are enforced in production. The route MUST respect them or inserts fail.

**research_scripts** (no `user_id` column — ownership is via `research_job_id` join):
- `research_job_id UUID NOT NULL`
- `angle_id UUID NOT NULL` (FK → research_angles)
- `script TEXT NOT NULL` — **CHAR_LENGTH 50–10240** (≈10 KB)
- `sections_json JSONB` — array only, **CHAR_LENGTH(::text) ≤ 5120** (≈5 KB)
- `quality_score DECIMAL(3,2)` — 0..1
- subscores (all nullable, 0..1): `hook_strength`, `source_coverage`, `clarity`, `originality`, `risk_disclosure`, `rhythm_fit`, `duration_fit`
- `approved BOOLEAN NOT NULL DEFAULT FALSE`
- `approval_notes TEXT`, `model_used TEXT`, `tokens_used INT`

**research_storyboards** (no `user_id` column):
- `research_job_id UUID NOT NULL`
- `script_id UUID NOT NULL` (FK → research_scripts)
- `scenes_json JSONB NOT NULL` — **must be a non-empty array**, **CHAR_LENGTH(::text) ≤ 102400** (100 KB)

**research_jobs.status** allowed values (CHECK): `draft, discovering, extracting, ready_for_angles, scripting, approved, sent_to_director, failed`.
→ There is **no** `ready_for_script` status. Do not invent one.

> Size limits are **character** counts (`CHAR_LENGTH`), not bytes. Validate with string `.length`, not `TextEncoder`.

---

## Route

### POST /api/research/jobs/[id]/script
**Purpose:** Generate one script + one storyboard from the selected angle.

**Auth:** Required (Supabase session, Bearer token)
**Path param:** `id` (job UUID)

**Request body (optional):**
```json
{ "angle_id": "uuid" }
```
- If `angle_id` provided → use that angle (must belong to the job).
- If omitted → use the single `selected = TRUE` angle.

**Preconditions:**
- Job owned by user
- Job status = `ready_for_angles` OR `failed` (recovery, error_step ≠ `scripting`)
- Exactly one target angle resolved (see Failure model for 0 / multiple)

**Operation:**
1. Verify ownership + status gate
2. Resolve target angle (explicit `angle_id`, else the `selected = TRUE` angle)
3. Set job.status → `scripting`
4. Build LLM prompt from job (topic, mode) + angle (title, hook, positioning) + selected/extracted sources
5. Call LLM once → expect strict JSON `{ script, sections, subscores, scenes }`
6. Validate + size-check script, sections_json, scenes_json
7. Insert research_scripts row (`approved = FALSE`)
8. Insert research_storyboards row referencing the new `script_id`
9. On success → job.status stays `scripting` (script awaits user approval; no UI yet)
   On failure → job.status = `failed`, error_step = `scripting`

**Response (200):**
```json
{
  "id": "uuid",
  "status": "scripting",
  "script_id": "uuid",
  "storyboard_id": "uuid",
  "scenes_count": 6,
  "quality_score": 0.82,
  "error_message": null
}
```

**Errors:** 401 (no auth) · 404 (job not found / non-owned) · 400 (status gate) · 422 (no selected angle) · 409 (multiple selected, no explicit angle_id) · 500 (LLM / DB / size failure)

---

## LLM Contract

**Env (server-side only, provider hidden from responses):**
```
RESEARCH_LLM_API_KEY=<key>
RESEARCH_LLM_MODEL=claude-opus-4-8
RESEARCH_LLM_TIMEOUT_MS=30000
RESEARCH_LLM_MAX_TOKENS=4000
```

**Prompt input:** topic, mode, the chosen angle (title/hook/positioning), and up to 5 extracted-source excerpts (truncated ~500 chars each for cost control).

**Expected strict JSON output:**
```json
{
  "script": "Full narration/script text...",
  "sections": [
    { "label": "Hook", "content": "...", "duration_sec": 4 }
  ],
  "subscores": {
    "hook_strength": 0.8, "source_coverage": 0.7, "clarity": 0.9,
    "originality": 0.6, "risk_disclosure": 0.5, "rhythm_fit": 0.7, "duration_fit": 0.8
  },
  "scenes": [
    { "title": "Hook shot", "prompt": "Describe the visual...", "duration_sec": 5 }
  ]
}
```

`quality_score` is computed server-side as the mean of present subscores (clamped 0..1) — not trusted from the model directly.

---

## Script Contract

- `script`: trimmed; **must be 50–10240 chars**. If > 10240 → truncate to a clean boundary ≤ 10240 (do not fail on length alone). If < 50 after generation → treat as invalid → failed.
- `sections_json`: array; serialized length **≤ 5120 chars**. If over → drop trailing sections until it fits (keep at least 1). Store `NULL` if no valid sections.
- `quality_score` + subscores: clamp each to 0..1; omit (NULL) any missing subscore.
- `approved = FALSE` always on creation.
- No provider name in any user-facing field.

---

## Storyboard Contract (Director-compatible)

- `scenes_json`: **non-empty array**, serialized length **≤ 102400 chars**.
- Each scene normalized to:
  - `title` (or `role`) — required, non-empty string
  - `prompt` — required, non-empty string
  - `duration_sec` — integer, **clamped to [3, 10]** (accept `durationSec` or `duration_sec` from the model; emit canonical `duration_sec`)
- Drop scenes missing `title/role` or `prompt`. If 0 valid scenes remain → failed.
- If serialized array exceeds 100 KB → drop trailing scenes until it fits (keep ≥ 1).
- **No invented asset references.** Do not emit `byteplus_asset_id`, face IDs, or any asset the job did not supply.
- **No "exact try-on" / "exact face" promises** unless a real asset was provided by the job. Scene prompts describe generic visuals only.

---

## Failure Model

| Condition | HTTP | job.status | error_step |
|-----------|------|-----------|------------|
| No auth | 401 | unchanged | — |
| Job not found / non-owned | 404 | unchanged | — |
| Status not ready_for_angles/failed | 400 | unchanged | — |
| No angle selected & no angle_id | 422 | unchanged | — |
| Multiple selected & no angle_id | 409 | unchanged | — |
| LLM timeout / API error | 500 | failed | scripting |
| Invalid / non-JSON LLM output | 500 | failed | scripting |
| script < 50 chars after gen | 500 | failed | scripting |
| 0 valid scenes | 500 | failed | scripting |
| DB insert error | 500 | failed | scripting |

Oversized `script` / `sections_json` / `scenes_json` → **truncate to fit** (not a failure), per contracts above. No retry V1.

---

## Tests Expected

1. **Auth required** — no Bearer → 401
2. **Ownership** — other user's job → 404
3. **Status gate** — ready_for_angles / failed(recoverable) proceed; others → 400
4. **No selected angle** — 0 selected & no angle_id → 422
5. **Multiple selected angles** — >1 selected & no angle_id → 409
6. **Explicit angle_id** — body angle_id overrides selection, must belong to job
7. **LLM mock success** — inserts 1 script + 1 storyboard, response carries ids + scenes_count
8. **Invalid JSON** — malformed LLM output → failed + error_step=scripting
9. **Script size cap** — >10240 chars → truncated, insert succeeds
10. **sections_json size cap** — >5120 chars → trailing dropped to fit
11. **scenes_json size cap** — >100 KB → trailing scenes dropped to fit
12. **Scene duration clamp** — duration_sec 1 and 999 → clamped to 3 and 10
13. **Director compatibility** — each stored scene has title/role + prompt + duration_sec ∈ [3,10]
14. **0 valid scenes** — all scenes missing prompt → failed
15. **No external calls** — LLM fully mocked, no env vars required

---

## Non-Goals (V1)

- ❌ Video generation / Director submission (that's later, via existing `scenes[]` handoff)
- ❌ Multiple scripts per job (one script + one storyboard per call)
- ❌ User approval flow / UI
- ❌ Retry on LLM failure
- ❌ n8n orchestration
- ❌ New migration (schema from T-1101 is sufficient)

---

## Files to Create

- `lib/research/script.ts` — pure helpers: `buildScriptPrompt`, `parseScriptResponse`, `validateScript`, `normalizeScenes`, `clampSceneDuration`, `computeQualityScore`
- `app/api/research/jobs/[id]/script/route.ts` — POST handler
- `app/api/research/jobs/[id]/script/__tests__/script.test.ts` — unit tests
- This spec file

No migration. No `user_id` in script/storyboard inserts — both child tables key off `research_job_id` only.

---

## Open Decision (flag for approval)

**End status on success.** Spec proposes job stays `scripting` (script generated, `approved = FALSE`, awaiting a future approval step). Alternative would be a new status, but the enum has none suitable before user approval. Confirm `scripting` is acceptable, or specify the intended terminal status.

---

## Version History

| Date | Status | Notes |
|------|--------|-------|
| 2026-06-11 | Spec draft | T-1106 script + storyboard via LLM, aligned to real T-1101 schema |

---

**Owner:** Backend / AlphoResearch
**Next:** Implementation (same cycle if spec validated)
