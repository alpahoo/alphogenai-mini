-- 🔧 CORRECTION DES JOBS BLOQUÉS
-- Exécutez cette requête pour nettoyer les jobs bloqués

-- 1. Marquer tous les jobs in_progress comme failed
UPDATE jobs
SET 
  status = 'failed',
  error_message = 'Marqué comme failed - nettoyage manuel',
  updated_at = NOW()
WHERE status = 'in_progress';

-- 2. Marquer les anciens jobs pending avec retry > 3 comme failed
UPDATE jobs
SET 
  status = 'failed',
  error_message = 'Trop de retries - marqué comme failed',
  updated_at = NOW()
WHERE status = 'pending' AND retry_count >= 3;

-- 3. Vérifier le résultat
SELECT 
  status,
  COUNT(*) as nombre
FROM jobs
GROUP BY status;
