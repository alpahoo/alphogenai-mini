-- Create private storage bucket for videos
insert into storage.buckets (id, name, public)
select 'videos', 'videos', false
where not exists (select 1 from storage.buckets where id = 'videos');

-- Policies on storage.objects for bucket 'videos'
-- Allow users to list and get only their own objects under path 'videos/{uid}/...'
create policy if not exists "Users can read own video files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'videos'
  and (owner = auth.uid())
  and (name like ('videos/' || auth.uid() || '/%'))
);

-- Allow users to upload into their own prefix
create policy if not exists "Users can upload own video files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'videos'
  and (owner = auth.uid())
  and (name like ('videos/' || auth.uid() || '/%'))
);

-- Allow users to delete their own objects
create policy if not exists "Users can delete own video files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'videos'
  and (owner = auth.uid())
  and (name like ('videos/' || auth.uid() || '/%'))
);

