# Library Looks Management

**Status:** Spec-only (audit + decisions)

**Version:** 1.0-draft

**Priority:** TIER 1 — Suite logique post-T-802 (save) + T-803 (reuse + costing)

---

## Product Goal

Donner aux utilisateurs une interface dédiée pour gérer leurs Looks sauvegardées : renommer, supprimer, prévisualiser, et réutiliser sans naviguer dans `/create/avatar`. Visible et cohérent avec Library existante.

### UX Goals
- **Découverte** : afficher toutes les Looks de l'utilisateur au même endroit
- **Gestion** : rename facile (modal), delete avec confirmation
- **Réutilisation** : bouton "Reuse" → auto-navigate `/create/avatar?look_id=...`
- **Contexte** : durée, date créée, thumbnail (pour reconnaître visuelle)

---

## Current State Audit

### API `/api/looks`

#### GET /api/looks
**Route:** `app/api/looks/route.ts` (L19–34)
- **Auth:** Supabase user required
- **Query:** `SELECT id, name, video_url, thumbnail_url, duration_sec, created_at FROM cinematic_looks WHERE user_id = ? ORDER BY created_at DESC`
- **Response:** `{ looks: [...] }`
- **Status:** ✅ Ready to use

#### POST /api/looks
**Route:** `app/api/looks/route.ts` (L36–126)
- **Input:** `{ job_id, name? }`
- **Logic:**
  1. Fetch job (must be `engine_used="heygen_avatar_shots"`)
  2. Extract clip from `job_scenes[0].clip_url` or `jobs.output_url_final`
  3. Download + upload to R2 with key pattern `looks/{user_id}/{job_id}-{timestamp}.mp4`
  4. Insert row with `{ user_id, name (auto-default to job.prompt), video_url (R2), thumbnail_url (null), duration_sec, source_job_id }`
- **Note:** `thumbnail_url` is column but never populated (null always)
- **Status:** ✅ Ready, but thumbnail_url unused

#### DELETE /api/looks?id=...
**Route:** `app/api/looks/route.ts` (L128–142)
- **Auth:** Supabase user required
- **Logic:** `DELETE FROM cinematic_looks WHERE id = ? AND user_id = ?`
- **Note:** R2 video not cleaned up (orphans after hard delete)
- **Status:** ✅ Ready (hard delete only)

### Current UI Usage

#### `/create/avatar` (cinematic mode)
- **Feature:** "Reuse a saved Look" section (L491–544)
- **Display:** Grid of Looks with selection
- **Interaction:** Click Look → select it for new script/voice + lip-sync
- **Status:** ✅ Works but no dedicated management

#### No dedicated Looks management UI
- **Gap:** No way to rename, delete, or browse Looks except via `/create/avatar`
- **Problem:** Discovery is poor; users don't know what Looks they have

### Database Schema

```sql
Table: cinematic_looks
- id: UUID PRIMARY KEY
- user_id: UUID NOT NULL (FK users)
- name: TEXT NOT NULL (editable, currently from job.prompt)
- video_url: TEXT NOT NULL (R2 persistent URL)
- thumbnail_url: TEXT (currently always NULL)
- duration_sec: INT (from job_scenes[0].duration_sec or inferred)
- source_job_id: UUID (audit trail; FK jobs, no constraint)
- created_at: TIMESTAMP DEFAULT now()
- updated_at: TIMESTAMP DEFAULT now() (NOT UPDATED on rename — should it be?)

Indexes: user_id, created_at
RLS: none (app-layer auth only)
```

---

## UX Decisions

### 1. Routing

**Option A: `/library?tab=looks`** (recommended)
- Cohérent : reuse Library sidebar + tab navigation
- **Pros:** UX consistante, ne crée pas une route isolée
- **Cons:** mélange jobs + looks dans Library
- **Recommendation:** ✅ Choix pour V1

**Option B: `/workspace/looks`**
- Dédiée : route isolée, plus visible
- **Pros:** URL claire, contrôle complet du layout
- **Cons:** nouvelle route, potentiellement isolée de Library

**Decision:** `/library?tab=looks` (align avec Library existante, T-705 past pattern)

---

### 2. Delete Strategy

**Option A: Hard delete** (current)
- `DELETE FROM cinematic_looks WHERE id = ?`
- **Pros:** Simple, immédiat
- **Cons:** Irreversible, no audit trail, R2 orphan

**Option B: Soft delete** (archive)
- Add column: `deleted_at: TIMESTAMP DEFAULT NULL`
- Filter: `WHERE deleted_at IS NULL` in all queries
- **Pros:** Reversible, audit trail, can restore
- **Cons:** Complexity, need cleanup job

**Decision:** Start with **hard delete** (V1 simple) → soft delete in V1+ if needed based on user feedback

**Cleanup:** Manual R2 orphan cleanup task (out of scope V1)

---

### 3. Rename

**Current:** Name set on save, immutable
**Desired:** User-editable name with modal

**Approach:**
- `PATCH /api/looks/[id] { name }` (new endpoint)
- Validation: name length [1..100], trim whitespace
- Updates: `name`, `updated_at` (add audit)
- UI: Rename modal on grid item, inline pencil icon or context menu

**Non-goal:** Bulk rename, tags, folders (future)

---

### 4. Thumbnail Strategy

**Current:** `thumbnail_url` column exists but always NULL (never populated)

**Options:**

#### Option A: Extract first frame on POST /api/looks
- **Approach:** When saving a Look, extract first frame from R2 video, upload as PNG
- **Pros:** Automatic, visual preview immediately available
- **Cons:** Image processing complexity, timing (POST latency?), cost
- **Implementation:** ffmpeg locally or cloudflare-worker-based?

#### Option B: Lazy thumbnail generation
- **Approach:** Generate on first GET `/library?tab=looks`, cache in R2/DB
- **Pros:** No latency on save, background generation
- **Cons:** Cold start (first view slow), more complex

#### Option C: No thumbnail (MVP)
- **Approach:** Keep `thumbnail_url=NULL`, show video player inline instead
- **Pros:** Simple, no image processing
- **Cons:** Slow grid render (many video elements), less visual

**Decision:** ✅ **Option C (MVP)** — No thumbnail for V1, show video preview inline
- **Rationale:** Simplest, unblocks UI. Can add thumbnail in V1+ after user validation
- **Future:** Consider lazy generation or scheduled batch job if needed

---

## Planned UI / UX

### `/library?tab=looks`

**Layout:**
- Tab bar: "Projects" | "Jobs" | **Looks** (new)
- Hero: "Saved cinematic shots — reuse with new voices and scripts"
- Grid: responsive (4 cols desktop, 2 mobile)

**Grid Items:**
- Video preview (inline `<video>` with poster=first-frame if available, else video)
- Overlay: Looks name (editable on hover)
- Badge: duration (e.g., "10s")
- Actions (on hover):
  - Pencil icon → Rename modal
  - Trash icon → Delete confirmation
  - Play/Reuse button → `/create/avatar?look_id=...`

**Rename Modal:**
- Text input: current name (pre-filled, 1..100 chars)
- Buttons: Save | Cancel
- Validation feedback: char count, "too long" error

**Delete Confirmation:**
- Warning: "This will permanently delete the Look. You can still reference the original job."
- Buttons: Delete (red) | Cancel
- Post-delete: remove from grid, toast "Look deleted"

**Empty State:**
- Icon + text: "No Looks yet. Save a cinematic shot from a completed job to get started."
- CTA: Link to `/create/avatar` or `/admin/jobs` to find completed jobs

---

## API Additions (for T-804a/b/c)

### 1. PATCH /api/looks/[id]
**Purpose:** Rename a Look

**Request:**
```json
{
  "name": "Professional intro v2"
}
```

**Response (200):**
```json
{
  "look": {
    "id": "look-xyz",
    "name": "Professional intro v2",
    "updated_at": "2026-06-10T18:00:00Z"
  }
}
```

**Errors:**
- 400: Missing name, name too long (>100)
- 401: Unauthorized
- 404: Look not found or not owned by user
- 500: DB error

### 2. DELETE /api/looks/[id]
**Already exists.** No changes needed (hard delete is acceptable for MVP).

**Improvement (future):**
- Add soft-delete support with `deleted_at` column
- Clean up R2 orphans with scheduled job

---

## Implementation Phases

### Phase 1 — T-804a: UI list/grid + rename modal
**Scope:**
- `app/(workspace)/library/page.tsx` : Add "Looks" tab (new)
- Reuse Library layout, sidebar, styling
- Grid component : video preview + name + actions
- Rename modal : input + validation
- Empty state

**No DB changes, no new routes yet.**

**Dependencies:** T-802 (affordance) ✅, T-803 (costing) ✅ done

### Phase 2 — T-804b: Thumbnail generation strategy
**Scope:**
- Decide : lazy vs batch vs none for thumbnail
- If implementing: add image processing + R2 upload
- Update `POST /api/looks` to populate `thumbnail_url`

**Risk:** Image processing complexity (ffmpeg, quality, cost)

### Phase 3 — T-804c: Rename endpoint + delete confirmation + E2E tests
**Scope:**
- `PATCH /api/looks/[id]` route (rename)
- Delete confirmation modal (UI)
- Tests : E2E workflow (save → rename → delete → reuse)
- Validation: name length, ownership checks

**Dependencies:** Phase 1 (grid UI) done

---

## Risk & Mitigation

| Risk | Mitigation |
|------|------------|
| **Thumbnail processing latency** | Start MVP without thumbnails; lazy-gen later |
| **Grid render performance** (many video elements) | Lazy-load videos, virtualize grid if >50 Looks |
| **R2 orphans** (hard delete) | Manual cleanup task; soft delete in V1+ if needed |
| **Rename concurrency** (same Look, two users) | Supabase RLS + user_id check handles this |
| **Accidental delete** (no undo) | Confirmation modal + clear warning |

---

## Non-Goals (V1)

- ❌ Bulk operations (rename all, delete all)
- ❌ Tags, folders, collections
- ❌ Share Looks (public gallery)
- ❌ Looks analytics (usage, reuse count)
- ❌ Thumbnail generation (MVP shows video preview only)
- ❌ Soft delete with restore

---

## Testing Strategy

### Unit Tests
- `PATCH /api/looks/[id]` validation (name length, ownership)
- Rename helper (if extracted)

### Integration Tests
- `POST /api/looks` → verify `thumbnail_url` behavior (null for now)
- `PATCH /api/looks/[id]` → verify name update + updated_at
- `DELETE /api/looks/[id]` → verify hard delete + ownership

### E2E Tests (Playwright)
- **Workflow:** Create job → Save as Look → Library list → Rename → Delete
- **Edge cases:** Empty state, long names, rapid renames, multiple Looks

---

## Rollout Plan

### T-804a (UI list/grid)
- Week 1: Grid + rename modal UI (no backend routes yet)
- Tests: Component tests + Playwright grid render
- Launch: `/library?tab=looks` visible in sidebar

### T-804b (Thumbnail strategy)
- Week 2: Audit image processing options (ffmpeg, cloudflare, etc.)
- Decision: implement lazy-gen or defer to V1+

### T-804c (Rename + delete + E2E)
- Week 2: `PATCH /api/looks/[id]` route + tests
- Week 3: E2E test suite + bug fixes
- **Launch:** Full Library Looks management ready for production

---

## Open Questions

1. **Thumbnail format & size:** PNG 320x180 or dynamic? Cached where (R2 or DB)?
2. **Video preview performance:** Inline `<video>` or lazy-load iframes?
3. **Rename permissions:** Allow anonymous users to rename (if logged in)? Or admin-only?
4. **Soft delete timeline:** If we add soft delete later, what's the archive duration before hard purge?
5. **Orphaned R2 videos:** Cleanup strategy (manual job, cron, or ignore for now)?

---

## Appendix: Existing Related Code

### Current "Reuse a Look" UI
**File:** `app/(workspace)/create/avatar/page.tsx` (L491–544)
```tsx
{selectedLookId && (
  <p className="mt-3 text-xs text-cyan-400/80">
    Using this Look — skip the avatar & shot steps below...
  </p>
)}

{looks.map((lk) => (
  <button
    onClick={() => setSelectedLookId(selectedLookId === lk.id ? null : lk.id)}
    className={`...`}
  >
    {lk.name} {selectedLookId === lk.id && <CheckCircle2 />}
  </button>
))}
```

### Existing Library Page
**File:** `app/(workspace)/library/page.tsx` (417 lines)
- **Tabs:** Jobs (default) | references | social-ready
- **Filters:** search, aspect, duration, model
- **Grid:** video + metadata + actions
- **Pattern:** Reuse for Looks tab

---

**Document Version:** 1.0-draft
**Last Updated:** 2026-06-10
**Author:** Claude (Spec)
**Status:** Ready for T-804a/b/c planning
