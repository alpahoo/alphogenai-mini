# Research Source Media Collector Spec (T-1110a)

**Status:** Spec / audit (docs). No runtime code yet.
**Owner:** Research / AlphoResearch
**Scope:** Let Research Studio surface real, usable **source media** (page screenshots, og/twitter images, product shots, logos, video thumbnails, doc captures) as **suggested references**, manually selected by the user before the Director handoff — never auto-injected, never invented.

---

## 1. Audit (current contracts)

- **`research_sources`** columns: `id, research_job_id, url, title, source_type, credibility_score, extracted_markdown, published_at, author, selected, extraction_status, extraction_error, extraction_time_ms, created_at, updated_at`. **No media/metadata/jsonb field.**
- **`research_storyboards`**: `id, research_job_id, script_id, scenes_json`. (cinematic `reference_asset_hint` is descriptive text only — no real media.)
- **Create references pipeline** (`app/api/jobs/route.ts`): a video job accepts `references` (object, validated by `lib/validate-references.ts` with **ownership checks**), plus `byteplus_asset_ids` and a single `referenceImageUrl`. References are passed through to the providers.
- **Reference storage** = private **Supabase Storage bucket `references`** (NOT R2). Pattern (`lib/r2.ts` + future-proof-notes §3.8): store the **storage path** as source of truth (`<user_id>/<job_id>/<uuid>.ext`), mint a **signed URL on demand** via `signReferenceUrl(path, ttl)`. R2 is for **public video output** only.
- **Extractor (Hostinger gateway)** currently returns Markdown with `include_images:false` → **no media URLs captured today**. Media must come from a gateway enhancement, not the stored markdown.

**Implication:** reference images for Create live in the **private `references` bucket** with ownership + signed URLs. Research-collected media that the user selects should land in that **same** bucket so it plugs straight into the existing references pipeline.

---

## 2. Open questions — decisions

### 2.1 Table vs jsonb field → **new table `research_source_media`** (recommended)
Per-item **selection state + RLS + optional storage path + rights status** are first-class; a jsonb blob can't express per-item selection/ownership cleanly. A dedicated table matches the existing `research_*` family.

```sql
CREATE TABLE public.research_source_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  research_source_id UUID REFERENCES public.research_sources(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'og_image','twitter_image','inline_image','page_screenshot','video_thumbnail','logo','doc_capture'
  )),
  source_url TEXT NOT NULL,            -- original (public) media URL discovered on the page
  storage_path TEXT,                   -- set ONLY after user selects + we copy into `references` bucket
  width INT, height INT, mime TEXT,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  rights_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (rights_status IN ('unverified','user_confirmed')),
  risk_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT source_url_format CHECK (source_url ~ '^https?://')
);
-- Dedupe candidates per job (avoids duplicates on re-collect):
CREATE UNIQUE INDEX research_source_media_job_url_unique
  ON public.research_source_media(research_job_id, source_url);
-- No user_id column: ownership via research_jobs join + RLS (same pattern as research_sources).
```
Requires **one migration** (applied like T-1101). RLS: SELECT/INSERT/UPDATE/DELETE gated by `EXISTS(research_jobs WHERE id = research_job_id AND user_id = auth.uid())`.

### 2.2 Storage → **reuse the private `references` Supabase bucket** (not R2, not a new bucket)
- V1 default: **do NOT download** anything. We store only **candidate `source_url`s** (metadata) and render thumbnails in the browser directly from those public URLs (`<img src=external>`), so no server fetch / no private exposure.
- **Only on user selection** do we copy the chosen media server-side into `references/<user_id>/<job_id>/<uuid>.ext` and set `storage_path`. That copy *is* the "clear rule" for downloading: user-triggered, ownership-scoped, signed-on-demand. This makes it directly consumable by the existing Create references pipeline.

### 2.3 Rights → conservative, user-owned
- Every collected item is third-party → `rights_status='unverified'` + a `risk_note` ("Third-party media; you are responsible for usage rights").
- **No automatic rights clearance, no "authorized logo" auto-detection** (can't be determined). Selecting an item flips it to `user_confirmed` (explicit acknowledgement) before it can become a reference.
- We only collect media from the **public** page already extracted — never auth-walled/private media.

### 2.4 Cleanup
- Unselected candidates = metadata rows only → pruned by `ON DELETE CASCADE` when the research job is deleted. Cheap, no storage.
- Selected+copied files live in the `references` bucket under the job path → removed when the job (or its references) are cleaned, same lifecycle as Create references. Optional TTL sweep later.

---

## 3. Where candidates come from (gateway enhancement)

Extend the Hostinger extract gateway (`/api/extract`) — or add `/api/collect-media` — to also return, per URL, a bounded `media_candidates` list **without downloading**:
- `og:image`, `twitter:image` from `<meta>`;
- the top N (≤8) meaningful `<img>` (filter out icons/spacers by size/role when known);
- `video_thumbnail` for youtube/vimeo sources (derive from the canonical thumbnail URL);
- **page screenshot** = V1.1 (Jina `X-Return-Format: screenshot` → needs hosting; defer).

Contract addition (additive, backward-compatible):
```json
{ "success": true, "markdown": "...", "char_count": 1234, "extraction_time_ms": 800, "error": null,
  "media_candidates": [ { "url": "https://.../hero.png", "kind": "og_image", "width": 1200, "height": 630 } ] }
```
No provider names; runs on the VPS behind the existing token gateway.

---

## 4. V1 product flow (no auto-injection)

1. **Collect** (after extraction): gather `media_candidates` per source → insert `research_source_media` rows (`selected=false`, `rights_status='unverified'`).
2. **Suggest**: Research UI shows them grouped by source as **"Suggested references"** (thumbnails from `source_url`), with the rights caveat.
3. **Select**: user picks items → server copies each into `references/<user_id>/<job_id>/<uuid>.ext`, sets `storage_path`, `selected=true`, `rights_status='user_confirmed'`.
4. **Handoff**: on "Send to Director", selected media map into the Create **references** payload (existing pipeline, ownership already satisfied). Nothing auto-injected; the user chose.

---

## 5. Director / Create mapping

Selected media (now in the `references` bucket, paths owned by the user) are passed to the handoff payload as reference descriptors `{ kind, storage_path }`; Create consumes them through the existing references pipeline (signed on demand). The cinematic `reference_asset_hint` (T-1109) stays descriptive text; T-1110 supplies the **actual** optional media the user approved.

---

## 5b. V1 implementation caveats (for T-1110c/d)

- **Thumbnail rendering** (UI, no server download): render `<img src=source_url referrerpolicy="no-referrer" loading="lazy">`; some domains block hotlinking → show a placeholder on error. Acceptable: a broken thumbnail just means "preview unavailable", the candidate still selectable.
- **Copy guard** (on selection → `references` bucket): server fetch of the third-party URL must enforce **max size (~10 MB)** and **`Content-Type: image/*`** only, with a short timeout, to prevent SSRF/abuse and oversized files. Reject otherwise (item stays unselected).
- **Dedupe**: unique `(research_job_id, source_url)` (see §2.1) keeps re-collection idempotent.

## 6. Non-goals (V1)

- ❌ No auto-download of all media (only user-selected items are copied).
- ❌ No auto-injection into generation; explicit user selection required.
- ❌ No automatic rights clearance / no logo-authorization detection.
- ❌ No private/auth-walled media; public page media only.
- ❌ No demo-video download (link/thumbnail only in V1).
- ❌ No provider leak, no n8n.
- ❌ Page screenshots deferred to V1.1.

---

## 7. Recommended découpage

- **T-1110a** — this spec.
- **T-1110b** — pure helper `lib/research/source-media.ts`: normalize/validate gateway `media_candidates` → typed candidates (kind enum, dedupe, drop tiny/icon, cap N, rights defaults). Unit-testable, no network. + tests.
- **T-1110c** — gateway enhancement (extract adapter returns `media_candidates`) + a collect step/route that persists `research_source_media`. Needs the **migration** (new table + RLS). curl + DB validation.
- **T-1110d** — Research UI "Suggested references" + selection → copy to `references` bucket + handoff mapping into Create references. Real e2e.

---

## 8. Tests expected (per step)

- Helper: candidate normalization (kinds, dedupe, size/icon filtering, cap, rights defaults), no provider leak, deterministic.
- Route/migration: `research_source_media` insert uses `research_job_id` (no `user_id` column), RLS enforced, selection flips `selected`/`rights_status`, copy sets `storage_path`.
- Handoff: only `selected=true && rights_status='user_confirmed'` items reach the references payload; ownership validated; existing pipeline tests stay green.

---

## Open decision for you
1. **New table `research_source_media`** (my reco) vs a `media_candidates` jsonb column on `research_sources`?
2. **Reuse the private `references` bucket** (my reco) vs a dedicated bucket / R2?
3. Confirm a **migration is acceptable** for T-1110 (it wasn't allowed in earlier tasks).

---

## Version history

| Date | Status | Notes |
|------|--------|-------|
| 2026-06-12 | Spec draft | T-1110a audit + media collector spec |
