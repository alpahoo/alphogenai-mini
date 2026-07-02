-- T-1136b: Podcast personas — a reusable "who" for a podcast speaker slot.
-- Base: docs/product/podcast-real-duo-persona-spec.md (T-1136a).
--
-- STRICTLY ADDITIVE. No changes to existing podcast tables beyond one nullable
-- column on podcast_speakers. No render/route/UI wiring in this migration.
--
-- Decoupled from byteplus_assets on purpose: that table models Seedance
-- video-generation consent (BytePlus console verification + asset:// refs),
-- a different consumer and a different consent model than a static podcast
-- portrait. See spec §2.2.
--
-- Product decisions baked in (T-1136b):
--   - V1 catalog = AlphoGen-owned/generated personas only (no celebrities, no
--     recognizable real people). Catalog rows have user_id NULL and are written
--     ONLY by the service role (RLS blocks user inserts of catalog rows).
--   - User-uploaded personas (source_kind='uploaded') are allowed by the schema
--     but MUST carry an explicit consent timestamp (enforced by CHECK below).
--     The upload route/UI ship later (T-1136c/d).
--   - source_kind='generated' reserved for AI-generated (non-real) personas.
--   - Existing podcast_speakers.avatar_id is left UNTOUCHED (legacy/free-form
--     fallback). persona_id is the structured reference the render will prefer
--     once populated (T-1136e).

-- ─────────────────────────────────────────────────────────────────────────
-- podcast_personas
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.podcast_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = public/global catalog row (admin/service-role managed).
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('catalog', 'uploaded', 'generated')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- Storage path (private bucket) or public catalog URL/path. Signed on read
  -- for private rows; catalog rows may be a public path.
  portrait_path TEXT NOT NULL CHECK (char_length(portrait_path) BETWEEN 1 AND 500),
  -- Optional smaller thumbnail (same pattern as byteplus_assets.thumb_path).
  thumb_path TEXT CHECK (thumb_path IS NULL OR char_length(thumb_path) <= 500),
  -- Consent is ONLY meaningful for user-uploaded personas (a real person's
  -- likeness). Recorded as a timestamp + the exact attestation wording version
  -- the user agreed to (auditable; copy changes don't invalidate old consents).
  consent_confirmed_at TIMESTAMPTZ,
  consent_statement_version TEXT
    CHECK (consent_statement_version IS NULL OR char_length(consent_statement_version) <= 60),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Integrity guard: an uploaded persona (real likeness) can NEVER exist
  -- without a recorded consent timestamp. Catalog/generated need none.
  CONSTRAINT podcast_personas_uploaded_requires_consent
    CHECK (source_kind <> 'uploaded' OR consent_confirmed_at IS NOT NULL)
);

-- Own personas, most recent first.
CREATE INDEX IF NOT EXISTS podcast_personas_user_id_created_at
  ON public.podcast_personas(user_id, created_at DESC);
-- Catalog listing (public rows only).
CREATE INDEX IF NOT EXISTS podcast_personas_catalog
  ON public.podcast_personas(created_at DESC)
  WHERE user_id IS NULL AND status = 'active';

ALTER TABLE public.podcast_personas ENABLE ROW LEVEL SECURITY;

-- SELECT: a user sees their OWN rows + the public catalog (active only).
DROP POLICY IF EXISTS podcast_personas_select ON public.podcast_personas;
CREATE POLICY podcast_personas_select ON public.podcast_personas
  FOR SELECT USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND status = 'active')
  );

-- INSERT: a user can only insert rows they own. Catalog rows (user_id NULL)
-- are intentionally NOT insertable by users — only the service role (which
-- bypasses RLS) writes catalog personas.
DROP POLICY IF EXISTS podcast_personas_insert ON public.podcast_personas;
CREATE POLICY podcast_personas_insert ON public.podcast_personas
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE: owner only (e.g. rename, soft-remove). Catalog rows: service role.
DROP POLICY IF EXISTS podcast_personas_update ON public.podcast_personas;
CREATE POLICY podcast_personas_update ON public.podcast_personas
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: owner only. (App prefers soft-delete via status='removed' so past
-- renders keep resolving, but a hard delete of one's own persona is allowed.)
DROP POLICY IF EXISTS podcast_personas_delete ON public.podcast_personas;
CREATE POLICY podcast_personas_delete ON public.podcast_personas
  FOR DELETE USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- podcast_speakers.persona_id — structured reference to a persona.
-- Nullable, ON DELETE SET NULL so a hard-deleted persona degrades the speaker
-- to the placeholder render rather than breaking the row. avatar_id untouched.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.podcast_speakers
  ADD COLUMN IF NOT EXISTS persona_id UUID
    REFERENCES public.podcast_personas(id) ON DELETE SET NULL;
