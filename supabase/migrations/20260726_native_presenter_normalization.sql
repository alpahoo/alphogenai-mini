-- Normalized private assets for the AlphoGen-native presenter track.
-- The original retained performance footage stays private and is never
-- overwritten. Modal writes a deterministic, silent, model-ready MP4 beside it.

ALTER TABLE public.user_presenter_native_bases
  ADD COLUMN IF NOT EXISTS normalized_video_path TEXT,
  ADD COLUMN IF NOT EXISTS normalized_duration_seconds NUMERIC(8,3),
  ADD COLUMN IF NOT EXISTS normalized_width INTEGER,
  ADD COLUMN IF NOT EXISTS normalized_height INTEGER,
  ADD COLUMN IF NOT EXISTS normalized_fps NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS normalization_version TEXT,
  ADD COLUMN IF NOT EXISTS normalization_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS normalized_at TIMESTAMPTZ;

ALTER TABLE public.user_presenter_native_bases
  DROP CONSTRAINT IF EXISTS user_presenter_native_bases_normalized_path_length,
  ADD CONSTRAINT user_presenter_native_bases_normalized_path_length CHECK (
    normalized_video_path IS NULL
    OR char_length(normalized_video_path) BETWEEN 1 AND 500
  ),
  DROP CONSTRAINT IF EXISTS user_presenter_native_bases_normalized_duration,
  ADD CONSTRAINT user_presenter_native_bases_normalized_duration CHECK (
    normalized_duration_seconds IS NULL
    OR normalized_duration_seconds BETWEEN 0.5 AND 30.5
  ),
  DROP CONSTRAINT IF EXISTS user_presenter_native_bases_normalized_dimensions,
  ADD CONSTRAINT user_presenter_native_bases_normalized_dimensions CHECK (
    (normalized_width IS NULL AND normalized_height IS NULL)
    OR (
      normalized_width BETWEEN 256 AND 2160
      AND normalized_height BETWEEN 256 AND 2160
    )
  ),
  DROP CONSTRAINT IF EXISTS user_presenter_native_bases_normalized_fps,
  ADD CONSTRAINT user_presenter_native_bases_normalized_fps CHECK (
    normalized_fps IS NULL OR normalized_fps BETWEEN 15 AND 60
  );

CREATE INDEX IF NOT EXISTS user_presenter_native_bases_processing
  ON public.user_presenter_native_bases(status, updated_at)
  WHERE status IN ('uploaded', 'normalizing', 'failed');

COMMENT ON COLUMN public.user_presenter_native_bases.normalized_video_path IS
  'Private storage path for the model-ready H.264/AAC-silent performance clip.';
COMMENT ON COLUMN public.user_presenter_native_bases.normalization_version IS
  'Deterministic normalization contract version used to produce the private clip.';
