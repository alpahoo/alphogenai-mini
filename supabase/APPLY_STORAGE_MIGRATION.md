# Apply Storage Buckets Migration

## ⚠️ IMPORTANT: Apply RLS Policy Fix First

If you already applied the initial storage bucket creation (`20251023_create_storage_buckets.sql`), you MUST also apply the RLS policy fix migration (`20251024_fix_storage_rls_policies.sql`).

### Quick Fix (if uploads are failing)

**Problem:** File uploads fail with errors because RLS policies use incorrect syntax.

**Solution:**
1. Go to https://supabase.com/dashboard/project/qbrpzmuedfugbhoeytdj/sql/new
2. Copy the ENTIRE contents of `supabase/migrations/20251024_fix_storage_rls_policies.sql`
3. Paste into the SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify with: 
   ```sql
   SELECT policyname, cmd FROM pg_policies 
   WHERE schemaname = 'storage' AND tablename = 'objects'
   ORDER BY policyname;
   ```
6. You should see 8 policies total (4 for videos, 4 for assets)
7. Test file upload at `/admin/storage` - it should now work!

### Why this fix is needed

The initial migration (`20251023_create_storage_buckets.sql`) used `auth.role() = 'authenticated'` which doesn't work in Supabase. The function `auth.role()` returns PostgreSQL role names like 'postgres', 'anon', 'service_role' - NOT authentication status.

The correct syntax is `auth.uid() IS NOT NULL` which returns true when a user is logged in.

---

## Original Storage Bucket Setup

### Problem
The video generation workflow fails with these errors:
- `404 Bucket not found` when uploading final videos
- `400 Bad Request` when accessing background music

### Solution
Run the SQL migration to create the required storage buckets.

## Steps

### 1. Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project: **qbrpzmuedfugbhoeytdj**

### 2. Open SQL Editor
1. Click **SQL Editor** in the left sidebar
2. Click **New query**

### 3. Run the Migration
1. Copy the contents of `supabase/migrations/20251023_create_storage_buckets.sql`
2. Paste into the SQL Editor
3. Click **Run** (or press Cmd/Ctrl + Enter)

### 4. Verify Success
You should see:
```
Success. No rows returned
```

Then verify the buckets were created:
1. Click **Storage** in the left sidebar
2. You should see two buckets:
   - ✅ **videos** (public)
   - ✅ **assets** (public)

### 5. Upload Music Files (Optional)
If you want background music in your videos:
1. Open the **assets** bucket
2. Create folder structure: `music/inspiring/`, `music/synth/`, `music/light/`, `music/dramatic/`, `music/epic/`
3. Upload MP3 files matching the names in `workers/music_selector.py` (lines 20-44)

### 6. Test Video Generation
Create a new video job and verify it completes successfully without storage errors.
