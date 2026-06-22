-- T-1131e: Podcast render output columns (Option A — no podcast_renders table in V1).
-- Stores the final composited MP4 + render state on the podcast row. RLS already
-- enabled on public.podcasts; these columns inherit it. Additive only.

ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS video_url TEXT
    CHECK (video_url IS NULL OR video_url ~ '^https?://'),
  ADD COLUMN IF NOT EXISTS render_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (render_status IN ('idle', 'rendering', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS render_error TEXT
    CHECK (render_error IS NULL OR char_length(render_error) <= 2000);
