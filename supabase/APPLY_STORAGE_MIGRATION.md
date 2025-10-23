# Apply Storage Buckets Migration

## Problem
The video generation workflow fails with these errors:
- `404 Bucket not found` when uploading final videos
- `400 Bad Request` when accessing background music

## Solution
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
