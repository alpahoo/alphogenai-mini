-- 🔍 DIAGNOSTIC COMPLET DES JOBS
-- Exécutez cette requête dans Supabase SQL Editor

-- 1. État actuel de TOUS les jobs
SELECT 
  id,
  LEFT(prompt, 50) as prompt_preview,
  status,
  current_stage,
  retry_count,
  created_at,
  updated_at,
  CASE 
    WHEN updated_at < NOW() - INTERVAL '5 minutes' AND status = 'in_progress' 
    THEN '⚠️ BLOQUÉ'
    ELSE '✅ OK'
  END as etat
FROM jobs
ORDER BY created_at DESC
LIMIT 10;

-- 2. Comptage par statut
SELECT 
  status,
  COUNT(*) as nombre,
  MAX(created_at) as dernier_job
FROM jobs
GROUP BY status
ORDER BY dernier_job DESC;

-- 3. Jobs créés dans les 10 dernières minutes
SELECT 
  id,
  prompt,
  status,
  current_stage,
  retry_count,
  created_at,
  updated_at
FROM jobs
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;

-- 4. Jobs avec erreurs
SELECT 
  id,
  LEFT(prompt, 40) as prompt,
  status,
  current_stage,
  error_message,
  retry_count
FROM jobs
WHERE error_message IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
