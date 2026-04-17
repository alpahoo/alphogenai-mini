-- Multi-Reference V1: store reference media payload on jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS references_payload JSONB;

COMMENT ON COLUMN public.jobs.references_payload IS 'Multi-reference input: { images: [{role, url, weight}], videos: [...], audio: [...] }';
