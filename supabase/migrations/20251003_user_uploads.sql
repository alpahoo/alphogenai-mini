-- Create private bucket for user uploads
insert into storage.buckets (id, name, public)
values ('user_uploads', 'user_uploads', false)
on conflict (id) do nothing;

-- Policies to restrict access to owner's path: `${auth.uid()}/{filename}`
-- Ensure RLS is enabled on storage.objects (it is by default)

-- Read own files
create policy if not exists "read_own_files" on storage.objects
for select
using (
  bucket_id = 'user_uploads'
  and auth.uid()::text = split_part(name, '/', 1)
);

-- Upload (insert) to own folder only
create policy if not exists "insert_own_files" on storage.objects
for insert
with check (
  bucket_id = 'user_uploads'
  and auth.uid()::text = split_part(name, '/', 1)
);

-- Delete own files only
create policy if not exists "delete_own_files" on storage.objects
for delete
using (
  bucket_id = 'user_uploads'
  and auth.uid()::text = split_part(name, '/', 1)
);

