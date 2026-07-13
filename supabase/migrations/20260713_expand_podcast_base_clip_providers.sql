-- T-1158: make podcast motion-base caching provider-neutral.
-- Additive contract expansion only; existing HeyGen rows remain unchanged.

ALTER TABLE public.podcast_persona_base_clips
  DROP CONSTRAINT IF EXISTS podcast_persona_base_clips_provider_check;

ALTER TABLE public.podcast_persona_base_clips
  ADD CONSTRAINT podcast_persona_base_clips_provider_check
  CHECK (provider IN ('heygen', 'byteplus', 'runway', 'modal'));
