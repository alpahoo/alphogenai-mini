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
  c.relname AS tablename,
  con.conname,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname LIKE 'research_%'
  AND n.nspname = 'public'
  AND con.contype = 'c'  -- CHECK constraints
ORDER BY c.relname, con.conname;

-- Expected: JSON validation, size limits (50KB, 10KB, 100KB),
--           score ranges (0-1), URL format, topic length, etc.

-- ========================================
-- 7. Check triggers for updated_at maintenance
-- ========================================
SELECT
  c.relname AS tablename,
  t.tgname,
  pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname LIKE 'research_%'
  AND n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- Expected: 3 triggers (research_jobs, research_sources, research_scripts)
--           All call update_updated_at_column() function

-- ========================================
-- 8. Quick schema summary
-- ========================================
SELECT
  c.relname AS tablename,
  (SELECT COUNT(*) FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'c') AS check_constraints,
  (SELECT COUNT(*) FROM pg_indexes i WHERE i.schemaname = n.nspname AND i.tablename = c.relname) AS indexes,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname LIKE 'research_%'
  AND n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ========================================
-- Summary: If all queries return expected results, migration is validated ✓
-- ========================================
