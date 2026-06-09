-- ---------------------------------------------------------------------------
-- T-1002 — Gallery curation schema (spec: docs/product/gallery-curation-redesign-spec.md)
-- ---------------------------------------------------------------------------
-- A dedicated table for the CURATED public showcase. The public /gallery must
-- NEVER infer publishability from job status — nothing is public unless an admin
-- explicitly publishes a gallery_items row (status = 'published').
--
-- Privacy model:
--   * Default row state is 'draft' (private, not listed).
--   * Public (anon + authenticated) can SELECT ONLY status = 'published'.
--   * There is NO anon/authenticated insert/update/delete policy → all writes
--     are denied for non-service clients (default-deny).
--   * Admin reads (drafts/hidden) and all writes go through the SERVICE-ROLE
--     client (which BYPASSES RLS), gated at the app layer by isAdminEmail()
--     (lib/flags.ts) — admins are NOT identified in-DB, so RLS can't reference
--     them. This mirrors the existing /api/admin/* pattern.
--
-- Column names match the public projection contract in lib/gallery-showcase.ts
-- (GalleryItemRow) so the page can normalize published rows without reading jobs.
--
-- Additive + idempotent (CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS). No
-- backfill. Does not touch jobs or any existing table/data.

CREATE TABLE IF NOT EXISTS public.gallery_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Optional link back to the private source job (for future "Create similar").
  -- ON DELETE SET NULL: deleting a job must never delete a curated showcase row.
  source_job_id     UUID REFERENCES public.jobs(id) ON DELETE SET NULL,

  media_type        TEXT NOT NULL DEFAULT 'video'
                    CHECK (media_type IN ('video', 'image')),

  -- Privacy gate. 'draft' = private/not listed (default), 'published' = public,
  -- 'hidden' = pulled from public without deleting.
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'hidden')),

  -- Public, admin-curated copy. NEVER auto-filled from raw private prompts.
  title             TEXT NOT NULL,
  subtitle          TEXT,
  public_prompt     TEXT,
  category          TEXT NOT NULL DEFAULT 'cinematic',

  -- Public media. media_url is required to render a card.
  media_url         TEXT NOT NULL,
  thumbnail_url     TEXT,
  poster_url        TEXT,
  aspect_ratio      TEXT,
  duration_seconds  INTEGER,

  -- Provider-neutral display label only (may be null). Never a raw engine key.
  display_model     TEXT,

  -- Editorial placement controls.
  sort_order        INTEGER NOT NULL DEFAULT 0,
  featured          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Admin author (auth user). SET NULL if that admin account is removed.
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ
);

-- Indexes ------------------------------------------------------------------
-- Public listing query: status = 'published' ordered by featured + sort_order.
CREATE INDEX IF NOT EXISTS idx_gallery_items_published
  ON public.gallery_items (sort_order, created_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_gallery_items_status_category
  ON public.gallery_items (status, category);
CREATE INDEX IF NOT EXISTS idx_gallery_items_source_job_id
  ON public.gallery_items (source_job_id);

-- RLS ----------------------------------------------------------------------
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

-- Public (anon + authenticated) may read ONLY published rows. Drafts/hidden are
-- invisible to everyone except the service role (admin routes / SSR).
DROP POLICY IF EXISTS "Public reads published gallery items" ON public.gallery_items;
CREATE POLICY "Public reads published gallery items"
  ON public.gallery_items FOR SELECT
  USING (status = 'published');

-- Service role: full access for admin CRUD + server rendering of drafts.
-- (service_role already bypasses RLS; this is explicit, matching house style.)
DROP POLICY IF EXISTS "Service role full access on gallery items" ON public.gallery_items;
CREATE POLICY "Service role full access on gallery items"
  ON public.gallery_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Auto-update updated_at. search_path pinned (R-018d #3 — avoid reintroducing
-- the function_search_path_mutable advisor). SECURITY INVOKER (default).
CREATE OR REPLACE FUNCTION public.gallery_items_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gallery_items_updated_at ON public.gallery_items;
CREATE TRIGGER trg_gallery_items_updated_at
  BEFORE UPDATE ON public.gallery_items
  FOR EACH ROW
  EXECUTE FUNCTION public.gallery_items_set_updated_at();
