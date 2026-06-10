# Lip-Sync Existing Video / Reuse Shot with New Voice

**Status:** Partially implemented (V1 core logic exists; UX affordance + costing incomplete)

**Version:** 1.0-draft

---

## Product Goal

Reduce video generation costs by allowing users to reuse a successfully generated cinematic video (a "Look") without re-rendering the scene, applying only a new script + voice + lip-sync.

### UX Flow (Proposed V1)
1. User completes a HeyGen Avatar Shots job (cinematic video)
2. Button: **"Save as Look"** → persists the video clip to R2, creates a reusable template
3. From Library or job page: **"Reuse with new voice"** → new job, lip-sync-only (no Seedance regen)
4. User inputs new script + voice, preview cost, confirm
5. Job generated in ~30–60s (TTS + lip-sync only), cost ~5–20% of full video

---

## Current Implementation Status

### ✅ Implemented

#### 1. Save a cinematic video as a Look
**Route:** `POST /api/looks`
- Accepts `job_id` (must be `engine_used="heygen_avatar_shots"`)
- Downloads clip from `job_scenes[0].clip_url` or `jobs.output_url_final`
- Persists to R2 with key pattern `looks/{user_id}/{job_id}-{timestamp}.mp4`
- Creates DB row in `cinematic_looks` table:
  - `id, user_id, name, video_url, thumbnail_url, duration_sec, source_job_id, created_at`
- Called from: page job (`app/jobs/[id]/page.tsx`) button **"Save as Look"** (cyan)
  - Only visible for `job.engine_used === "heygen_avatar_shots"`

#### 2. List user's saved Looks
**Route:** `GET /api/looks`
- Returns array of `{ id, name, video_url, thumbnail_url, duration_sec, created_at }`
- Auth required; filtered by `user_id`
- Used by: `app/(workspace)/create/avatar/page.tsx` (cinematic mode)

#### 3. Delete a Look
**Route:** `DELETE /api/looks?id=...`
- Removes DB row only (R2 clip remains); auth required

#### 4. Create a lip-sync-only job from a Look
**Route:** `POST /api/jobs` with payload:
```json
{
  "prompt": "script_text",
  "preferred_engine": "heygen_avatar_shots",
  "look_id": "look-...",
  "voice_id": "voice-...",
  "script_text": "...",
  "lipsync_mode": "speed" | "precision",
  "audio_mode": "none"
}
```

**Flow (inside route):**
- Validates `look_id` exists and belongs to user
- Creates `jobs` row with status `"pending"`
- Creates `job_scenes` row (index 0) with status `"pending"`
- Calls `generateSpeech(script_text, voice_id)` → HeyGen TTS → `{ audioUrl, durationSeconds }`
- Calls `createLipsync(look.video_url, audioUrl, lipsync_mode, durationSeconds)` → HeyGen lip-sync API → `lipsync_id`
- Updates `job_scenes` with `status: "generating"`, stores `lipsync_id` in metadata
- Polls HeyGen async task; on completion, muxes audio → final video

**Cost:** ~5–20% of full cinematic video (no Seedance, only TTS + lip-sync)

#### 5. Helpers
- `buildSavedLookReusePayload()` in `lib/saved-look-payload.ts`
  - Validates `lookId`, `scriptText`, `voiceId`, `lipsyncMode`
  - Returns typed payload or error message
- `generateSpeech(text, voiceId)` in `lib/heygen-client.ts`
  - HeyGen TTS API (v3/voices/speech)
  - Returns `{ audioUrl, durationSeconds }` or `null` on timeout/error
  - Timeout: 20s
- `createLipsync(videoUrl, audioUrl, mode, endTimeSeconds)` in `lib/heygen-client.ts`
  - HeyGen lip-sync API (v3/lipsyncs)
  - Supports `endTimeSeconds` to clip video to match audio duration
  - Mode: `"speed"` (cheaper, ~5min) or `"precision"` (better sync, ~15–30min)

#### 6. UI: Reuse a saved Look
**Page:** `app/(workspace)/create/avatar/page.tsx`
- Mode: cinematic (not presenter)
- Section: **"Reuse a saved Look"**
- Lists user's Looks; click to select
- When selected:
  - Show script textarea
  - Show voice selector
  - Show lip-sync mode toggle (speed / precision)
  - Generate button → calls `/api/jobs` with look_id payload
- **Only visible when `looks.length > 0`**

### ⚠️ Partially Implemented / Not Yet

#### 1. UX Affordance: "Reuse with new voice" CTA
**Missing:** No button on job page to directly navigate → reuse flow
- Current: User must manually navigate to `/create/avatar`, switch to cinematic mode, select Look
- Proposed: Button on completed job → "Reuse with new voice" → auto-navigate to `/create/avatar?look_id=...`
  - Only visible for `engine_used="heygen_avatar_shots"`

#### 2. Cost Transparency
**Missing:** No estimate shown before creating a reuse job
- Proposed: Preview costing in UI
  - Full video cost: X credits (stored as `estimated_cost_usd` on jobs)
  - Lip-sync-only cost: ~5–20% of X (depends on TTS length + lip-sync mode)
  - Helper needed: `estimateLipsyncCost(scriptLength, lipsyncMode) → creditEstimate`

#### 3. Library Page
**Current:** No dedicated page to browse / manage Looks
- Looks are only accessible from `/create/avatar`
- Proposed (V2): Sidebar → **"Library"** → tab "Saved Looks"
  - Browse, rename, delete, preview, quick-reuse

#### 4. Lip-sync compatibility indicator
**Missing:** No messaging on other video types
- Only Avatar Shots support lip-sync reuse (V1)
- Proposed: On completed Seedance/EvoLink/other job, grayed-out "Save as Look" with tooltip:
  - "This video cannot be reused for lip-sync yet. Cinematic Avatar Shots only."

#### 5. Script content-policy screening
**Question:** When reusing a Look with a new script, should the new script be re-screened for safety?
- Current code: No screening (inherits from `app/api/jobs/route.ts` which skips prompt enhancement for avatar jobs)
- Proposed: Depends on risk profile—if new script is user-input text (not generated), may want re-screening

### ❌ Not Implemented / Out of Scope V1

#### 1. Lip-sync on arbitrary videos
- V1 only supports Looks (pre-screened, known-good video format)
- Arbitrary Seedance/EvoLink/other videos require format compatibility check
- **Deferred to V2** (requires format detection, quality testing)

#### 2. Alternative TTS providers (ElevenLabs, open-source)
- V1 uses HeyGen's native TTS (tied to cloned voice_ids already in user's account)
- ElevenLabs / open-source TTS requires:
  - API keys / credentials
  - Voice mapping (ElevenLabs voice_id ≠ HeyGen voice_id)
  - Separate cost tracking
  - Consent/licensing logic (especially ElevenLabs commercial)
- **Deferred to V2**: Introduce `voice_provider` abstraction; support ElevenLabs + open-source TTS
- V1 Note: If user needs non-HeyGen voice, they must re-generate full video (Seedance + HeyGen TTS)

#### 3. Editing lip-sync results
- Lip-sync jobs are read-only (no scene editing, scene regeneration)
- Differs from full Avatar Shots jobs (which support scene editing, regeneration)
- **Out of scope:** Might be V2 if needed

---

## Technical Details

### Database Schema

#### Table: `cinematic_looks`
```sql
id UUID PRIMARY KEY
user_id UUID (FK users)
name TEXT
video_url TEXT (R2 persistent URL, never expires)
thumbnail_url TEXT (optional, for Library UI)
duration_sec INT (from first scene or inferred)
source_job_id UUID (FK jobs, for audit trail)
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### Table: `jobs` (no schema change needed)
- Lip-sync jobs reuse existing fields:
  - `preferred_engine: "heygen_avatar_shots"`
  - `look_id` stored in request body; **not persisted on jobs table** (stored in job_scenes metadata instead)
  - `voice_id` (stored in job_scenes metadata)
  - `audio_mode: "none"` (no separate audio track; lip-sync burns audio into video)

#### Table: `job_scenes` (for lip-sync jobs)
```sql
...existing columns...
metadata: {
  "stage": "lipsync",
  "lipsync_id": "string (HeyGen task ID)",
  "cinematic_url": "string (Look video URL, for audit trail)"
}
```

### Workflow: Create Lip-Sync Job

```
POST /api/jobs
  body: {
    prompt,
    preferred_engine: "heygen_avatar_shots",
    look_id,
    voice_id,
    script_text,
    lipsync_mode
  }
  ↓
1. Auth check: user owns the look
2. Create jobs row:
   - status: "pending"
   - engine_used: "heygen_avatar_shots"
   - current_stage: "queued"
   - estimated_cost_usd: ~5-20% of standard avatar cost
3. Create job_scenes row (index 0)
4. generateSpeech(script_text, voice_id) → audioUrl, durationSeconds
5. createLipsync(look.video_url, audioUrl, lipsync_mode, durationSeconds) → lipsync_id
6. Update job_scenes:
   - status: "generating"
   - external_task_id: lipsync_id
   - metadata: { stage, lipsync_id, cinematic_url }
7. Update jobs:
   - status: "in_progress"
   - current_stage: "muxing_audio"
8. Polling: getLipsyncTask(lipsync_id) every 5–10s
9. On HeyGen completion:
   - Download final video
   - Update job_scenes.clip_url, job_scenes.video_url
   - Update jobs: status "done", output_url_final
10. Return to user: video ready
```

### Cost Calculation

**Full Avatar Shots video:**
- ~50–100 credits (varies by duration, resolution, model upgrades)

**Lip-sync reuse:**
- TTS (HeyGen): ~1–5 credits (depends on script length, voice model)
- Lip-sync (HeyGen): ~2–10 credits (depends on mode: speed vs precision, duration)
- **Total: ~3–15 credits (~5–20% of full video)**

**Helper (proposed):**
```typescript
function estimateLipsyncCost(
  scriptLength: number,
  lipsyncMode: "speed" | "precision"
): number {
  // TTS cost per character (~0.01 credits/100 chars)
  const ttsCost = Math.ceil(scriptLength / 100) * 0.1;
  // Lip-sync cost per second (speed ~2/s, precision ~5/s)
  const avgDuration = 10; // estimate
  const lipsyncCost = lipsyncMode === "precision" 
    ? avgDuration * 5 
    : avgDuration * 2;
  return Math.ceil(ttsCost + lipsyncCost);
}
```

### Error Handling

#### Incompatible Look
```
look_id points to non-HeyGen-Avatar-Shots video
→ Return 400: "This Look cannot be reused. Only cinematic (Avatar Shots) Looks are supported."
```

#### Missing script / voice
```
!script_text || !voice_id
→ Return 400: "A script and a voice are required to reuse a Look."
```

#### TTS failure
```
generateSpeech() returns null (timeout, API error, invalid voice)
→ Job status: "failed"
→ Error message: "Lip-sync failed: [TTS error detail]"
```

#### Lip-sync failure
```
createLipsync() throws (format mismatch, invalid audio/video URL, API error)
→ Job status: "failed"
→ Error message: "Lip-sync failed: [error detail]"
```

#### Invalid voice_id
```
voice_id is not in user's list of cloned voices
→ Return 400: "Voice not found. Pick from your cloned voices."
```

---

## Security & Privacy

### Authentication
- All endpoints require `user` (via Supabase auth)
- Looks are user-owned; checked on every read/write
- Service-role client used for internal DB operations only

### Data Residency
- Looks stored in R2 (persistent, never expire like HeyGen temp URLs)
- DB records in `cinematic_looks` are owned by user_id

### Provider Confidentiality
- No provider names ("HeyGen", "Seedance") exposed in public UI labels
- Buttons use neutral language: "Save as Look", "Reuse with new voice"
- Provider details only in logs and settings
- Voice selector shows voice names (cloned voice names are user-defined, safe)

### Cost Transparency
- Estimated cost shown before job creation
- Actual cost stored on jobs row
- No silent/surprise charges

---

## Non-Goals

1. ❌ **Support arbitrary video lip-sync** — Only tested/known-working formats (Avatar Shots first)
2. ❌ **Automatic script screening** — V1 assumes user-provided scripts are safe; V2 can add re-screening
3. ❌ **Alternative voice providers (V1)** — HeyGen cloned voices only; V2 abstracts `voice_provider`
4. ❌ **Editing lip-sync results** — Reuse jobs are immutable; create new job if changes needed
5. ❌ **Exporting Looks as templates** — Share / marketplace deferred

---

## Testing Strategy (V1)

### Unit Tests
- `buildSavedLookReusePayload()` validation (required fields, max length)
- `estimateLipsyncCost()` (if added)
- Error message generation

### Integration Tests
- `POST /api/looks` (save, verify R2 + DB)
- `GET /api/looks` (list, auth check)
- `DELETE /api/looks` (cleanup, orphan R2 on failure)
- `POST /api/jobs` with `look_id` (full flow: TTS → lip-sync → polling)
  - Mock HeyGen API responses
  - Test error paths (invalid look, TTS timeout, lip-sync failure)
  - Verify job/scene status transitions

### Manual QA
- User flow: Complete Avatar Shots job → "Save as Look" → navigate to `/create/avatar` → "Reuse" → new job
- Verify cost estimate displayed
- Verify final video has new voice + original visuals

---

## Rollout Plan (V1)

### Phase 1 (Current)
- ✅ Core logic implemented (save Look, reuse Look, TTS + lip-sync)
- ✅ Route tests passing
- **Next:** Spec review (this doc)

### Phase 2
- [ ] UX affordance: "Reuse with new voice" button on job page → `/create/avatar?look_id=...`
- [ ] Cost estimate display in UI before job creation
- [ ] Error messaging (incompatible video, missing fields, etc.)
- [ ] QA manual testing
- [ ] Update `/workspace/library` or create dedicated Looks panel

### Phase 3 (V2)
- [ ] Detect incompatible video formats; offer graceful error
- [ ] Optional: Script content-policy re-screening
- [ ] Voice provider abstraction (`voice_provider: "heygen" | "elevenlabs" | "openai"`)
- [ ] ElevenLabs integration (with cost, consent, API key management)
- [ ] Open-source TTS option (self-hosted or third-party)
- [ ] Looks thumbnail generation + preview
- [ ] Library page with browse/rename/delete UX
- [ ] Export Look as shareable template (future)

---

## Decisions & Rationale

### Why only HeyGen Avatar Shots (V1)?
- Proven compatibility with HeyGen lip-sync API
- Seedance/EvoLink videos are complex multi-scene compositions; unsuitable for lip-sync overlay
- Avoids format fragmentation in V1; allows focused QA

### Why TTS = HeyGen cloned voices (V1)?
- User already imported voices into HeyGen account
- Native lip-sync quality (HeyGen voice → HeyGen lip-sync, optimized pairing)
- Reduces cost + complexity vs. ElevenLabs (no extra API keys, credentials, licensing)
- V2 can abstract `voice_provider` for flexibility

### Why not auto-generate lip-sync for all Avatar Shots jobs?
- Not all users want it; some prefer re-gen for style variety
- User must explicitly "Save as Look" and "Reuse" → intentional, cost-aware flow
- Avoids "stranded" lip-synced assets if user changes voice/script mid-project

### Why store Looks in R2 instead of relying on HeyGen URLs?
- HeyGen URLs expire in ~24 hours; unreliable for long-term reuse
- R2 provides permanent storage under user ownership
- Decouples from HeyGen service uptime

---

## Open Questions

1. **Script content-policy:** Should new scripts be re-screened via `screenPrompt()`? Or inherit avatar job exemption?
   - Current: No re-screening
   - Proposal: Re-screen if new script differs significantly from saved Look prompt

2. **Lip-sync quality degradation:** Does repeated lip-sync (save → reuse → regen → lip-sync again) cause quality loss?
   - Test with real user workflows

3. **Thumbnail generation:** Should Looks display a preview image in Library?
   - Current: `thumbnail_url` column exists but unused
   - Proposed: Extract first frame from clip on save

4. **Monetization / Plan limits:**
   - Free users: Can save Looks but limited to N Looks?
   - Pro/Premium: Unlimited Looks?
   - Define limits if needed

5. **Lip-sync on short / long videos:** HeyGen has constraints (e.g., min/max duration). How do we handle?
   - Test edge cases (30s script vs. 5s Look, or vice versa)

---

## Appendix: API Examples

### Save a job as a Look
```bash
POST /api/looks
Authorization: Bearer {token}
Content-Type: application/json

{
  "job_id": "job-abc123",
  "name": "Professional interview intro"
}

→ Response 201
{
  "success": true,
  "look": {
    "id": "look-xyz",
    "name": "Professional interview intro",
    "video_url": "https://r2.example.com/looks/user-1/job-abc123-1718000000.mp4",
    "thumbnail_url": null,
    "duration_sec": 12,
    "created_at": "2024-06-10T14:30:00Z"
  }
}
```

### List Looks
```bash
GET /api/looks
Authorization: Bearer {token}

→ Response 200
{
  "looks": [
    {
      "id": "look-xyz",
      "name": "Professional interview intro",
      "video_url": "https://r2.example.com/...",
      "thumbnail_url": null,
      "duration_sec": 12,
      "created_at": "2024-06-10T14:30:00Z"
    },
    ...
  ]
}
```

### Reuse a Look with new voice/script
```bash
POST /api/jobs
Authorization: Bearer {token}
Content-Type: application/json

{
  "prompt": "Hello, welcome to our product demo",
  "preferred_engine": "heygen_avatar_shots",
  "look_id": "look-xyz",
  "voice_id": "voice-cloned-john-doe",
  "script_text": "Hello, welcome to our product demo",
  "lipsync_mode": "precision",
  "audio_mode": "none"
}

→ Response 201
{
  "jobId": "job-def456",
  "status": "pending",
  "estimatedCost": 8,
  ...
}
```

---

**Document Version:** 1.0-draft  
**Last Updated:** 2026-06-10  
**Author:** Claude (Audit & Spec)  
**Approver:** (awaiting)
