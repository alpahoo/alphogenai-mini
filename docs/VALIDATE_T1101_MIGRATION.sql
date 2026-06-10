-- T-1101 Migration Validation Script
-- Run this in Supabase SQL Editor to verify migration was applied successfully

-- ========================================
-- 1. Check all 5 tables exist
-- ========================================
SELECT
  tablename,
  schemaname
FROM pg_tables
WHERE tablename LIKE 'research_%'
  AND schemaname = 'public'
ORDER BY tablename;

-- Expected output: 5 rows
-- - research_angles
-- - research_jobs
-- - research_scripts
-- - research_sources
-- - research_storyboards

-- ========================================
-- 2. Check RLS is enabled on all tables
-- ========================================
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename LIKE 'research_%'
  AND schemaname = 'public'
ORDER BY tablename;

-- Expected output: 5 rows with rowsecurity = true

-- ========================================
-- 3. Check policies exist (SELECT, INSERT, UPDATE, DELETE per table)
-- ========================================
SELECT
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE tablename LIKE 'research_%'
  AND schemaname = 'public'
ORDER BY tablename, policyname;

-- Expected output: ~20 policies (4 per table: SELECT, INSERT, UPDATE, DELETE)

-- ========================================
-- 4. Check partial unique index for single selected angle
-- ========================================
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE tablename = 'research_angles'
  AND schemaname = 'public'
  AND indexname LIKE '%selected%';

-- Expected: research_angles_job_id_selected_partial with WHERE selected = TRUE

-- ========================================
-- 5. Check all indexes created
-- ========================================
SELECT
  indexname,
  tablename
FROM pg_indexes
WHERE tablename LIKE 'research_%'
  AND schemaname = 'public'
ORDER BY tablename, indexname;

-- Expected key indexes:
-- - research_jobs_user_id_created_at
-- - research_sources_job_url_unique (canonical URL per job)
-- - research_angles_job_id_selected_partial (partial unique)
-- - research_scripts_job_id_approved
-- - research_storyboards_job_id

-- ========================================
-- 6. Check CHECK constraints (size limits, ranges, formats)
-- ========================================
SELECT
  tablename,
  conname
FROM pg_constraint
WHERE tablename LIKE 'research_%'
  AND contype = 'c'
ORDER BY tablename, conname;

-- Expected: JSON validation, size limits (50KB, 10KB, 100KB),
--           score ranges (0-1), URL format, topic length, etc.

-- ========================================
-- 7. Check triggers for updated_at maintenance
-- ========================================
SELECT
  event_object_table,
  trigger_name
FROM information_schema.triggers
WHERE event_object_table LIKE 'research_%'
  AND trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Expected: 3 triggers (research_jobs, research_sources, research_scripts)
--           All call update_updated_at_column() function

-- ========================================
-- 8. Quick schema summary
-- ========================================
SELECT
  t.tablename,
  COUNT(CASE WHEN c.contype = 'c' THEN 1 END) AS check_constraints,
  COUNT(DISTINCT i.indexname) AS indexes,
  COUNT(DISTINCT p.policyname) AS policies
FROM pg_tables t
LEFT JOIN pg_constraint c ON c.conrelid = (SELECT oid FROM pg_class WHERE relname = t.tablename) AND c.contype = 'c'
LEFT JOIN pg_indexes i ON i.tablename = t.tablename
LEFT JOIN pg_policies p ON p.tablename = t.tablename
WHERE t.tablename LIKE 'research_%'
  AND t.schemaname = 'public'
GROUP BY t.tablename
ORDER BY t.tablename;

-- ========================================
-- Summary: If all queries return expected results, migration is validated ✓
-- ========================================
