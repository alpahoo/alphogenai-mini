-- ---------------------------------------------------------------------------
-- Scheduled Posts — Postiz-like multi-platform scheduling
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Target platforms (subset of: youtube, tiktok, instagram)
  platforms     TEXT[] NOT NULL DEFAULT '{}',

  -- Content — per-platform overrides
  title         TEXT,                          -- YouTube title / TikTok title
  description   TEXT,                          -- YouTube description
  hashtags      TEXT[] DEFAULT '{}',           -- Shared hashtags
  caption_tiktok    TEXT,                      -- TikTok-specific caption
  caption_instagram TEXT,                      -- Instagram-specific caption

  -- Platform-specific settings
  privacy_youtube   TEXT DEFAULT 'unlisted' CHECK (privacy_youtube IN ('public', 'unlisted', 'private')),
  privacy_tiktok    TEXT DEFAULT 'PUBLIC_TO_EVERYONE' CHECK (privacy_tiktok IN ('PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY')),
  thumbnail_url     TEXT,                      -- Custom thumbnail URL

  -- Schedule
  scheduled_at  TIMESTAMPTZ NOT NULL,          -- When to publish
  timezone      TEXT DEFAULT 'UTC',            -- User's timezone for display

  -- Status tracking
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'publishing', 'published', 'partially_published', 'failed', 'cancelled')),

  -- Per-platform results: { youtube: { success, url, error }, tiktok: {...}, instagram: {...} }
  publish_results JSONB DEFAULT '{}'::jsonb,
  error_message   TEXT,
  retry_count     INT DEFAULT 0,
  max_retries     INT DEFAULT 3,

  -- Timestamps
  published_at  TIMESTAMPTZ,                   -- When actually published
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id ON scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_scheduled_at ON scheduled_posts(status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_job_id ON scheduled_posts(job_id);

-- RLS
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Users can read their own scheduled posts
CREATE POLICY "Users read own scheduled posts"
  ON scheduled_posts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own scheduled posts
CREATE POLICY "Users insert own scheduled posts"
  ON scheduled_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own scheduled posts
CREATE POLICY "Users update own scheduled posts"
  ON scheduled_posts FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own scheduled posts
CREATE POLICY "Users delete own scheduled posts"
  ON scheduled_posts FOR DELETE
  USING (auth.uid() = user_id);

-- Service role has full access (for the cron worker)
CREATE POLICY "Service role full access on scheduled posts"
  ON scheduled_posts FOR ALL
  USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_scheduled_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scheduled_posts_updated_at
  BEFORE UPDATE ON scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_posts_updated_at();
