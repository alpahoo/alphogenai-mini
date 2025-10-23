# Fix Storage Bucket ID Mismatch

## Problem

The video generation workflow fails with these errors:
- `400 Bad Request` → "Bucket not found" when accessing music files
- `404 Bucket not found` → When uploading final videos

**Root cause:** Buckets were created manually via Supabase UI with auto-generated UUID IDs (e.g., `438e8726-...`), but the RLS policies reference simple string IDs (`'videos'`, `'assets'`). This mismatch prevents all access.

## Solution

Delete the UUID-based buckets and recreate them with correct simple string IDs so the RLS policies will work.

## Prerequisites

⚠️ **IMPORTANT:** This migration will DELETE existing buckets. If you have uploaded any files (music, videos), back them up first!

1. Go to https://supabase.com/dashboard/project/qbrpzmuedfugbhoeytdj/storage/buckets
2. Check if `videos` or `assets` buckets contain any files
3. If yes, download the files first before proceeding

## Steps

### 1. Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project: **qbrpzmuedfugbhoeytdj**

### 2. Open SQL Editor
1. Click **SQL Editor** in the left sidebar
2. Click **New query**

### 3. Run the Fix Migration
1. Copy the ENTIRE contents of `supabase/migrations/20251023_fix_storage_bucket_ids.sql`
2. Paste into the SQL Editor
3. Click **Run** (or press Cmd/Ctrl + Enter)

### 4. Expected Output

You should see:
```
Success. No rows returned
```

If you get an error like `cannot delete bucket with objects`, you need to:
1. Go to Storage > Buckets
2. Open each bucket (videos, assets)
3. Delete all files inside
4. Return to SQL Editor and run the script again

### 5. Verify Success

After running the script, verify the fix:

1. **Check buckets exist:**
   ```sql
   SELECT id, name, public FROM storage.buckets WHERE id IN ('videos', 'assets');
   ```
   
   Expected result:
   ```
   id      | name   | public
   --------|--------|--------
   videos  | videos | true
   assets  | assets | true
   ```

2. **Check RLS policies:**
   ```sql
   SELECT policyname, tablename FROM pg_policies 
   WHERE schemaname = 'storage' AND tablename = 'objects';
   ```
   
   You should see 4 policies listed.

3. **Verify in Storage UI:**
   - Click **Storage** in the left sidebar
   - You should see two buckets with simple names:
     - ✅ **videos** (public)
     - ✅ **assets** (public)

### 6. Upload Music Files (Optional)

If you want background music in your videos:
1. Open the **assets** bucket
2. Create folder structure: `music/inspiring/`, `music/synth/`, `music/light/`, `music/dramatic/`, `music/epic/`
3. Upload MP3 files matching the names in `workers/music_selector.py` (lines 20-44)

Without music files, videos will still generate successfully but without background music.

### 7. Test Video Generation

1. Go to your application: https://alphogenai-mini.vercel.app
2. Create a new video generation job
3. Verify it completes successfully without 400/404 storage errors
4. The final video should be accessible in the `videos` bucket

## Troubleshooting

**Error: "cannot delete bucket with objects"**
- Solution: Delete all files from the buckets via Storage UI first

**Buckets still show UUID IDs in UI**
- Solution: Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)

**Still getting 400/404 errors after migration**
- Verify the buckets have the correct string IDs (not UUIDs) using the verification queries above
- Check that all 4 RLS policies were created successfully
