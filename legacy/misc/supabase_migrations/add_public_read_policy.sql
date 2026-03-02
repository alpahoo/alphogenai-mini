-- Migration: Ajouter politique de lecture publique pour les vidéos terminées
-- Date: 2025-10-04
-- Description: Permet aux visiteurs non authentifiés de voir les vidéos done/completed sur la homepage

-- Créer policy pour lecture publique des vidéos terminées
CREATE POLICY IF NOT EXISTS "Public can view completed videos"
ON public.jobs
FOR SELECT
USING (
  status IN ('done', 'completed')
  AND final_url IS NOT NULL
);

-- Commentaire pour documentation
COMMENT ON POLICY "Public can view completed videos" ON public.jobs IS 
'Permet la lecture publique des vidéos terminées pour affichage sur la landing page';
