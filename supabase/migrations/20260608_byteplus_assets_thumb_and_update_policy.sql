-- Retroactive, additive migration for traceability.
-- These changes were already applied manually to prod
-- (project qbrpzmuedfugbhoeytdj) during the verified-face self-service work;
-- this file records them in the repo. Idempotent — safe to re-run.
--
-- 1. Display photo for a verified BytePlus face. Stores a storage path in the
--    private `references` bucket; the API signs it on read. The Asset ID stays
--    the source of truth for generation (asset://<asset_id>).
alter table public.byteplus_assets
  add column if not exists thumb_path text;

-- 2. UPDATE RLS policy was missing (only select/insert/delete existed), which
--    blocked user-side PATCH / upsert-on-conflict (e.g. attaching a photo or
--    renaming a face). Add it, scoped to the owner.
drop policy if exists byteplus_assets_update_own on public.byteplus_assets;
create policy byteplus_assets_update_own on public.byteplus_assets
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
