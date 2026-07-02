# T-1136a — Podcast real duo/persona spec + mini-audit

> Docs-only. No runtime, no migration, no Modal changes in this ticket.
> Goal: chart the path from the current H/G placeholder podcast render
> to a Jogg-like podcast with two visible, chosen/created people —
> without committing to lip-sync or real-face generation yet.

**Status**: draft, awaiting product review before any `T-1136b..f` starts.

---

## 1. Read-only audit

### 1.1 Current podcast schema

Three tables (`supabase/migrations/20260622_create_podcast_schema.sql`), owner-scoped RLS via `podcasts.user_id`:

```
podcasts
  id, user_id, title, status, source_mode, source_topic, source_asset_url,
  layout ('two_shot' | 'split_screen' | 'talk_show'), aspect_ratio, language,
  error_message, created_at, updated_at
  (+ video_url, render_status, render_error — added 20260622_add_podcast_render_columns.sql)

podcast_speakers
  id, podcast_id, name, role ('host' | 'guest'), position,
  avatar_id TEXT NULL,   ← already exists, UNUSED by render today
  voice_id TEXT NULL,    ← already exists, used to resolve TTS voice
  created_at
  UNIQUE (podcast_id, role)   -- exactly one host + one guest per podcast

podcast_segments
  id, podcast_id, speaker_id, order_index, text, audio_url,
  start_ms, end_ms, status ('pending' | 'ready' | 'failed'), created_at
```

**Key finding**: `podcast_speakers.avatar_id` is **already a column**, already
selected by `render_podcast` indirectly (the whole speaker row is fetched),
but **never read for rendering** — `render_podcast` builds a placeholder via
`_podcast_avatar(name, color)` regardless of `avatar_id`. This is the natural
seam: a real/persona avatar is "just" populating `avatar_id` with something
resolvable and branching in `render_podcast`. No new column is required to
store *a reference* to an avatar; a real implementation will likely still
want a couple of additive columns (see §3).

### 1.2 Storage / buckets

| Bucket | Public | Path convention | RLS | Used for |
|---|---|---|---|---|
| `assets` | public | — | — | legacy/general public assets |
| `videos` | public | — | — | legacy job outputs |
| `references` | **private** | `{user_id}/{job_id}/{uuid}.{ext}` | per-user (insert/select/delete via `auth.uid()` = first path segment) | Multi-Reference V1 uploads (`app/api/upload/route.ts`), verified-face thumbnails (`byteplus_assets.thumb_path`) |

The `references` bucket is the right existing home for user-uploaded persona
photos: private by default, already has per-user RLS, already has a signed-URL
helper (`lib/r2.ts` — actually Supabase Storage here, not R2; see note below),
size/mime constraints precedent (`20260520_create_references_bucket.sql`:
10 MB, `image/jpeg|png|webp`).

> Note: podcast **audio/video outputs** are stored in **Cloudflare R2**
> (`uploadBufferToR2`, bucket `alphogenai-assets` via `R2_BUCKET_NAME`),
> while **reference/verified-face images** live in **Supabase Storage**
> bucket `references`. Two different storage systems already coexist in
> this codebase for different asset classes — a persona avatar image
> should follow the `references` (Supabase Storage) pattern, since it's
> a private, user-owned image asset like a verified face photo, not a
> generated output.

### 1.3 Reusable upload/looks/avatar routes

| Route | What it does | Reusable as-is? |
|---|---|---|
| `app/api/upload/route.ts` | Generic upload to R2 (legacy) + private `references` bucket | Partially — the `references` bucket upload path is reusable; would need a `kind`/`purpose` discriminator or a dedicated endpoint to keep podcast persona uploads distinct from Story/Avatar references. |
| `app/api/byteplus-assets/route.ts` | CRUD for **verified real-face** assets (BytePlus `asset://`), signs `thumb_path` from `references` on read | The **pattern** (verify externally → store an opaque asset id + a display thumbnail path → sign on read) is the right template for a "real person" duo type, but it's BytePlus-specific (Seedance video generation), not directly reusable for a podcast *still image*. |
| `app/api/looks/route.ts` (`cinematic_looks` table) | Saves a **rendered video clip** (HeyGen Avatar Shots output) for reuse via lip-sync | Not directly reusable — a Look is a reusable *output clip*, not a *persona identity*. Relevant precedent for V1.1 (talking avatar) reuse, not V1 (static portrait). |
| `components/create/faces-manager.tsx` | Self-service UI for verified faces (add by asset ID, photo tile, rename, delete) | UI pattern (tile grid, "Add a verified face" affordance, verified tick badge) is a good visual precedent for a future "Persona library" picker UI, but the underlying data (BytePlus asset IDs) doesn't apply to podcast portraits. |

**Conclusion**: no existing route can be reused unmodified. The closest
precedent end-to-end is `byteplus-assets` (external-verification-then-store
pattern) crossed with `references` bucket upload (storage/RLS pattern). A new,
podcast-specific persona resource is warranted rather than overloading
`byteplus_assets` (which is coupled to BytePlus's video-generation consent
flow and Seedance-specific `asset://` semantics).

### 1.4 `render_podcast` injection points

`modal_app/video_pipeline.py`:

- **`_podcast_avatar(name, color, size=220)`** (line ~2195): generates the
  placeholder circular avatar (gradient rings + initial letter). This is the
  single function to branch away from when a real image is available.
- **`render_podcast(podcast_id)`** (line ~2225):
  - Loads `speakers` (host/guest rows) — line ~2261. **This is where
    `avatar_id` (or a future `avatar_url`) would be read.**
  - Builds `host_av` / `guest_av` via `_podcast_avatar(...)` — lines
    ~2329-2330. **Injection point**: if the speaker has a resolvable avatar
    image (e.g. a signed URL to a portrait in `references`), download it
    here (same `httpx.Client` pattern already used for segment audio,
    lines ~2284-2291) and use it in place of the generated placeholder —
    resized/cropped to the same square used by `_podcast_avatar` so the rest
    of the layout code (`avi.resize((avatar_size, avatar_size))`, line ~2440)
    needs no change.
  - `dim_avatar()` (line ~2331) already works on any RGBA image, not just
    generated ones — **no change needed** for the inactive-speaker dimming.
  - The base-per-segment render strategy (`build_base()`, one image per
    timeline entry, reused across frames — lines ~2409-2463) is
    **orientation-agnostic**: it doesn't care whether the avatar is a
    generated placeholder or a downloaded portrait. A static real-portrait
    V1 fits this architecture with **zero change to the frame-composition /
    performance model** (still 1 base image per segment, not per frame).
  - **V1.1 (talking avatar / lip-sync)** would need a materially different
    per-segment asset (a short looping or lip-synced video clip instead of
    a static image) and would likely NOT fit the "one static base image per
    segment" perf model as-is — it would need either a per-segment video
    overlay (compositing a small video into the frame loop) or a full
    per-frame recomposition for segments using a talking persona.
    **This is the main technical fork between V1 and V1.1** and should be
    scoped as its own ticket with its own perf validation (CPU cost of
    decoding N looping talking-head clips per render vs. current all-CPU
    ffmpeg pipeline; likely needs GPU/Modal cost re-evaluation for V1.1).

### 1.5 Existing rights/consent constraints elsewhere

- **BytePlus verified faces** (`byteplus_assets`): the *only* existing
  precedent for "a real human face" in this codebase. Verification is
  **entirely external** — done in the BytePlus console, out of AlphoGen's
  control — AlphoGen just stores the resulting opaque `asset_id` +
  optional display `thumb_path`. **There is no in-app consent
  checkbox, attestation text, or rights-confirmation UI anywhere in the
  current codebase.** `HANDOVER.md` / `CLAUDE.md` describe the *technical*
  reason for verification (BytePlus's `PrivacyInformation` block on raw
  photos of real people), not a *policy* reason — i.e. today's "verification"
  is a provider anti-abuse gate, not a deliberate AlphoGen consent flow.
- **`lib/content-policy.ts`**: screens **prompt text** for named public
  figures / copyrighted IP / brands before calling any generation provider
  (`IP_BLOCKLIST`, public-figure heuristics). This does NOT cover uploaded
  *images* of a real person, nor does it cover a podcast's `hostName`/
  `guestName` free-text fields today — this is a gap if user-uploaded persona
  images or names could reference a real, non-consenting individual.
- **No existing self-attestation pattern** ("I own the rights to this image /
  this is me or someone who has consented") exists anywhere in the app for
  any feature. A real-face podcast duo would be the **first feature to need
  one** — it should not silently reuse BytePlus's console-side verification
  as a substitute for actual product-level consent UX, since BytePlus's gate
  is about generation-privacy risk, not licensing/consent per se.

**This is the single biggest open policy gap** the spec below must address
explicitly (§4), since there's no existing UI/DB pattern to copy verbatim.

---

## 2. Spec

### 2.1 Duo types

| Type | Description | Consent posture | Render asset |
|---|---|---|---|
| **A. Public catalog** | AlphoGen-provided, curated set of stock/illustrated or licensed presenter personas (drawn/stylized or licensed stock photography), selectable free of extra consent friction. | Pre-cleared by AlphoGen at catalog-authoring time; user picks, no attestation needed. | Static portrait (illustration or licensed photo), AlphoGen-owned asset, served from a public or signed AlphoGen-controlled bucket path (not user-uploaded). |
| **B. User uploaded** | User uploads a photo of themself or someone who has given them permission (e.g. a colleague, a client with sign-off). | **Requires explicit self-attestation** at upload time (see §4) — this is the type with the real risk (impersonation, non-consenting third party). | Static portrait, private per-user storage (`references`-style bucket), signed URL at render time. |
| **C. Generated persona** | AI-generated illustrated/stylized persona (not a real person), created from a text description or template (e.g. "friendly tech reviewer, animated style"). | No consent issue (no real individual depicted) — **but must be visually distinct from a real photo** to avoid implying a real presenter (aligns with the "no real personas without consent" non-goal). | Static generated image, stored like type A/B but flagged `source_kind='generated'`. |
| **D. My voice + AI guest** | User is the "voice" (their own cloned/verified voice via existing HeyGen voice cloning) paired with an AI-generated (type C) guest persona for the other role. | Same consent rules as whichever component is real (the user's own voice is self-consent by construction; the AI guest persona is type C, no consent needed). | Mixed: user's own portrait (type B, self only) or no portrait (voice-only host) + generated guest persona (type C). |

Types A and C are the safe, frictionless default path for V1. Type B is the
one that needs real product-level consent UX before it ships. Type D is a
natural combination once B and C both exist — not a new render capability.

### 2.2 Recommended data model (additive only, no destructive changes)

New table, decoupled from `byteplus_assets` (different consent model, different
consumer — podcast render, not Seedance video generation):

```sql
-- podcast_personas — a reusable "who" for a podcast speaker slot.
-- Owned by a user (private) OR global/catalog (user_id NULL, admin-managed).
CREATE TABLE public.podcast_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = public catalog
  source_kind TEXT NOT NULL CHECK (source_kind IN ('catalog', 'uploaded', 'generated')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  portrait_path TEXT NOT NULL,        -- storage path (private bucket) or public catalog URL
  thumb_path TEXT NULL,               -- optional smaller signed thumbnail, same pattern as byteplus_assets
  -- Consent is ONLY meaningful (and ONLY required) for source_kind='uploaded'.
  consent_confirmed_at TIMESTAMPTZ NULL,
  consent_statement_version TEXT NULL,   -- which attestation copy the user agreed to (for audit)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: user can CRUD own rows (user_id = auth.uid()); everyone can SELECT
-- catalog rows (user_id IS NULL AND status='active'); only service role
-- writes catalog rows (admin-managed, no user-facing catalog authoring).

-- podcast_speakers: additive column, nullable, no behavior change until read.
ALTER TABLE public.podcast_speakers
  ADD COLUMN IF NOT EXISTS persona_id UUID NULL REFERENCES public.podcast_personas(id) ON DELETE SET NULL;
-- avatar_id (existing TEXT column) stays as a legacy/free-form fallback;
-- persona_id is the structured reference render should prefer once populated.
```

Why a new table instead of extending `byteplus_assets`:
- `byteplus_assets` is scoped to **Seedance video generation** consent
  (BytePlus console verification, `asset://` references, engine-specific).
  Reusing it for podcast portraits would conflate two different consent
  models and two different consumers (video-gen engine vs. podcast render),
  making both harder to reason about and audit.
- A podcast persona is a **still image** with its own lightweight consent
  need (attestation, not BytePlus console verification) — a distinct,
  simpler resource is both safer and easier to explain in the UI.

### 2.3 Asset policy

- **Storage**: private bucket, same pattern as `references`
  (`podcast-personas/{user_id}/{uuid}.{ext}`), signed URLs at read/render
  time, 10 MB cap, `image/jpeg|png|webp` only (mirrors
  `20260520_create_references_bucket.sql`).
- **Catalog assets** (`source_kind='catalog'`, `user_id IS NULL`): may be
  served from a public path (AlphoGen-owned, pre-cleared) — no signing
  needed, same as other public marketing/catalog imagery.
- **Moderation**: run uploaded persona images through the same class of
  screening already gated on **prompt text** today (`content-policy.ts`),
  extended (new, separate ticket) to also flag `name` fields that match the
  public-figure/IP blocklist — a persona named "Elon Musk" or "Mickey Mouse"
  should be blocked regardless of the uploaded photo.
- **Retention/removal**: `status='removed'` (soft delete) rather than hard
  delete, so past renders referencing a since-removed persona don't 404 —
  the render pipeline should treat a `removed` persona's portrait as still
  fetchable for existing podcasts, but hide it from future picker results
  (mirrors the "additive, no destructive changes" DB convention already
  used elsewhere in this repo).

### 2.4 V1 render: static premium portraits in the podcast decor

- No change to the "one base image per segment" render architecture
  (§1.4) — a resolved persona portrait simply replaces the generated
  `_podcast_avatar()` circle inside the existing speaker card layout
  (studio background, active/inactive states, captions, branding — all
  untouched, this is T-1134e's finished visual system).
- Portrait resolution at render time: if `podcast_speakers.persona_id` is
  set, download + center-crop the persona's `portrait_path` into the same
  square avatar slot; otherwise fall back to `_podcast_avatar()` exactly as
  today (zero regression for existing/placeholder podcasts).
- No lip-sync, no motion — a **static, well-art-directed portrait** in the
  existing premium two-shot layout is the entire V1 scope.

### 2.5 V1.1: talking avatar / lip-sync premium (future, separate ticket)

- Only pursued after V1 ships and is validated. Requires:
  - A per-segment talking-head asset (likely via the existing HeyGen
    lip-sync pipeline already used for Avatar Shots / lip-sync-existing-video,
    per `docs/product/lipsync-existing-video-spec.md` and
    `lib/heygen-client.ts`) — i.e. this would reuse HeyGen's
    `generateSpeech()` + lip-sync helpers rather than inventing a new
    provider integration.
  - A render architecture change: per-segment video compositing instead of
    per-segment static base image (see §1.4's perf note) — cost and latency
    need explicit re-evaluation (this is expected to be materially more
    expensive than the current all-CPU render).
  - Consent requirements are **stricter** than V1 (a moving, speaking
    likeness is higher-risk than a static photo) — the attestation copy for
    type B personas used in V1.1 should be revisited, not silently reused
    verbatim from V1's static-portrait attestation.

### 2.6 UI target

- **Duo picker**, inserted as a step **before** dialogue generation on
  `/create/podcast` (new step, doesn't replace the existing "Write dialogue"
  step — it precedes it): user picks a persona for Host and for Guest
  independently, from: catalog grid (type A), "Upload your own" (type B,
  gated by the consent attestation modal), "Generate a persona" (type C,
  future — text-to-persona, out of scope for the initial picker build),
  or "Use my voice" (type D, ties into existing voice cloning).
- **Voice mapping per speaker**: the existing Host/Guest voice selectors
  (already on `/create/podcast`, `components` for `Natural · Warm (female)`
  etc.) stay conceptually separate from the persona picker — a persona
  (face) and a voice are independent choices that both resolve onto the
  same `podcast_speakers` row (`persona_id` + `voice_id`), matching the
  existing decoupled `avatar_id`/`voice_id` column design already in the
  schema.
- Consistent with the "no real personas without consent" non-goal: the
  "Upload your own" path is the ONLY path that shows the attestation modal;
  catalog and generated paths never prompt for consent (there's nothing to
  consent to).

### 2.7 Non-goals (this spec and its first implementation slices)

- No real, non-consented face may ever be used as a persona — enforced by
  making type B (uploaded) the only path with any real-person image, gated
  by mandatory attestation, and by keeping catalog (A) / generated (C)
  strictly non-photoreal-of-a-real-individual.
- No lip-sync or talking-avatar rendering until V1.1 is explicitly scoped
  and validated — V1 ships static portraits only.
- No automatic identity/face-matching verification (e.g. no liveness check,
  no reverse-image-search) in V1 — attestation is a legal/policy control,
  not a technical one, for this first slice. (A stronger technical
  verification, if ever needed, would be a follow-up, not a V1 blocker.)
- No changes to the existing placeholder H/G render path — it remains the
  default for any podcast that doesn't set a `persona_id` (zero regression).
- No public-facing persona catalog authoring UI in V1 — catalog rows are
  admin/service-role-managed only.

---

## 3. Ticket breakdown (T-1136b..f)

| Ticket | Scope | Depends on |
|---|---|---|
| **T-1136b** | DB: `podcast_personas` table + `podcast_speakers.persona_id` column (additive migration only, no runtime wiring). | This spec (T-1136a) reviewed/approved. |
| **T-1136c** | Backend: persona CRUD route (`app/api/podcast-personas/route.ts`) — list catalog + own personas, upload (type B, requires attestation flag in the request), delete (soft). Storage bucket + RLS (mirrors `references`). | T-1136b. |
| **T-1136d** | UI: Duo picker step on `/create/podcast` (catalog grid + "upload your own" with consent modal), wired to `persona_id` on save. No generated-persona (type C) UI yet — ships with a small seeded catalog (type A) + upload (type B) only. | T-1136c. |
| **T-1136e** | Modal: `render_podcast` persona resolution — download + composite a resolved portrait in place of `_podcast_avatar()` when `persona_id` is set; placeholder path unchanged when absent. | T-1136c (needs signed portrait URLs), independent of T-1136d (can render personas set directly in DB before the picker UI ships, for QA). |
| **T-1136f** | Content-policy extension: screen persona `name` fields (and, if feasible, a lightweight image-based public-figure check) against the existing public-figure/IP blocklist before a type B/C persona can be saved. | T-1136c. |

Suggested build order: **T-1136b → T-1136c → T-1136e (QA prod with a
manually-seeded persona) → T-1136f → T-1136d** — this front-loads the
riskiest/most novel piece (real portrait compositing in the Modal render,
§1.4's perf question) before investing in picker UI polish, and lets T-1136f
(policy) land before the UI (T-1136d) that would otherwise let users create
unscreened personas.

V1.1 (talking avatar / lip-sync) is explicitly **not** in this breakdown —
it needs its own spec once V1 (T-1136b..f) has shipped and been used.

---

## 4. Consent UX (detail, referenced by §2.1/§2.3/T-1136c/T-1136d)

Since no in-app precedent exists (§1.5), the attestation for type B
(user-uploaded) personas should be a explicit, logged checkbox + statement
at upload time, e.g.:

> "I confirm I own the rights to this image, or the person shown has given
> me explicit permission to use their likeness in AI-generated podcast
> videos on AlphoGen."

Stored as `consent_confirmed_at` (timestamp) + `consent_statement_version`
(so future copy changes don't retroactively invalidate old confirmations,
and so the exact wording agreed to is auditable). This mirrors the general
principle already used for Stripe webhook idempotency and other audit-style
columns in this codebase (record the fact + version, don't just record a
boolean).

---

## 5. Open questions for product review (stop point)

1. Does the V1 catalog (type A) get sourced from licensed stock photography,
   commissioned illustration, or AI-generated-but-clearly-stylized images?
   This affects licensing cost and the "must not look like a specific real
   person" non-goal enforcement.
2. Should "My voice + AI guest" (type D) be in the V1.1 picker scope or
   pushed further out — it's a UI combination of already-planned pieces
   (B/C) plus the existing voice-cloning flow, but wiring "my own portrait"
   host + generated guest together to a podcast has not been scoped for
   effort here.
3. Who authors/curates the initial catalog (type A) rows, and how many
   personas ship at V1 launch? (Blocks T-1136d's initial seed data.)
