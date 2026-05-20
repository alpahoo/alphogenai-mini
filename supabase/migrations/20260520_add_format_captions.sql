-- Add format (aspect ratio) and captions columns to jobs table
-- aspect_ratio: "16:9" | "9:16" | "1:1" (default 16:9 for backward compat)
-- caption_mode: "none" | "auto" | "custom" (default none)
-- caption_style: optional custom style when caption_mode = "custom"

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '16:9';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS caption_mode TEXT DEFAULT 'none';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS caption_style TEXT;
