-- Add audio mode columns to jobs table for user-facing audio controls
-- audio_mode: "none" | "auto" | "custom" (default auto for backward compat)
-- audio_prompt: custom text-to-audio prompt (when audio_mode = "custom")
-- voiceover_text: narration text for TTS voice-over generation

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS audio_mode TEXT DEFAULT 'auto';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS audio_prompt TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS voiceover_text TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS voiceover_url TEXT;
