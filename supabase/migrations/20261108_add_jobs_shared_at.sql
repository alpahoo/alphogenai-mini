-- ============================================================================
-- PROPOSITION — NON APPLIQUÉE. Ne pas exécuter sans validation du propriétaire.
-- ============================================================================
-- Publication explicite des pages publiques /v/[id].
-- Contexte : docs/security/job-privacy-2026-11.md §2.
--
-- Aujourd'hui app/v/[id]/page.tsx publie TOUT job status='done' à quiconque
-- connaît son id. Cette migration ajoute un consentement explicite :
--   shared_at IS NULL     → privé (défaut pour tout nouveau job)
--   shared_at IS NOT NULL → publié par son propriétaire (bouton "Share")
--
-- Strictement ADDITIVE : une colonne nullable + un index partiel. Aucune ligne
-- existante n'est modifiée par la partie active du fichier. Le backfill de
-- compatibilité (liens déjà partagés) est une DÉCISION PRODUIT : trois options
-- commentées en bas, une seule à décommenter.
--
-- Rollback : ALTER TABLE public.jobs DROP COLUMN IF EXISTS shared_at;
--            (uniquement après retour du code /v/[id] à l'ancien filtre).
-- ============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.jobs.shared_at IS
  'Publication explicite de la page publique /v/[id]. NULL = privé. '
  'Posé par le propriétaire (POST /api/jobs/[id]/share), effacé à la dépublication.';

-- Lookup /v/[id] : id + publié + terminé.
CREATE INDEX IF NOT EXISTS idx_jobs_shared
  ON public.jobs (id)
  WHERE shared_at IS NOT NULL;

-- ── RLS + GRANT explicites (CLAUDE.md) ──────────────────────────────────────
-- Table existante : RLS déjà active, réaffirmée ici (idempotent).
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Accès inchangés et explicites. AUCUN grant ni policy ajouté pour anon :
-- la page publique lit via service_role côté serveur et ne projette que des
-- colonnes publiques ; le public ne lit jamais public.jobs via la Data API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO service_role;
GRANT SELECT, UPDATE ON public.jobs TO authenticated;
-- Policies existantes conservées (users_select_own_jobs : auth.uid() = user_id,
-- service_role_all_jobs). Pas de policy "public can view shared jobs" : voulu.

-- ── Compatibilité liens déjà partagés : CHOISIR UNE OPTION ──────────────────
--
-- Option A — Grand-père total (aucun lien cassé, exposition actuelle conservée
-- pour l'historique, seuls les NOUVEAUX jobs deviennent privés par défaut) :
-- UPDATE public.jobs SET shared_at = COALESCE(updated_at, created_at, now())
--  WHERE status = 'done' AND shared_at IS NULL;
--
-- Option B — Strict (recommandée pour la confidentialité) : aucun backfill.
-- Tous les anciens liens /v/[id] renvoient 404 jusqu'à ce que le propriétaire
-- reclique "Share". Rien à exécuter.
--
-- Option C — Hybride : ne publier que les jobs avec une preuve d'intention
-- publique (vitrine galerie publiée ou post social publié) ; le reste suit B.
-- UPDATE public.jobs j SET shared_at = COALESCE(j.updated_at, now())
--  WHERE j.status = 'done' AND j.shared_at IS NULL
--    AND (
--      EXISTS (SELECT 1 FROM public.gallery_items g
--               WHERE g.source_job_id = j.id AND g.status = 'published')
--      OR EXISTS (SELECT 1 FROM public.scheduled_posts p
--               WHERE p.job_id = j.id
--                 AND p.status IN ('published', 'partially_published'))
--    );
