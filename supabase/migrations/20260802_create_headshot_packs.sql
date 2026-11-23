-- Professional Headshot packs: one consented identity, four independent looks.
CREATE TABLE IF NOT EXISTS public.headshot_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  subject_name TEXT CHECK (subject_name IS NULL OR char_length(subject_name) <= 100),
  source_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  consent_confirmed_at TIMESTAMPTZ NOT NULL,
  consent_statement_version TEXT NOT NULL DEFAULT 'headshot-likeness-v1',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','processing','ready','partial','failed','archived')),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS headshot_packs_user_created ON public.headshot_packs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.headshot_pack_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.headshot_packs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('studio','executive','natural','creative')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
  attempt INT NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  provider_task_id TEXT,
  image_url TEXT CHECK (image_url IS NULL OR image_url ~ '^https?://'),
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 4000),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pack_id, role)
);
CREATE INDEX IF NOT EXISTS headshot_pack_assets_pack_status ON public.headshot_pack_assets(pack_id, status);

DROP TRIGGER IF EXISTS headshot_packs_updated_at ON public.headshot_packs;
CREATE TRIGGER headshot_packs_updated_at BEFORE UPDATE ON public.headshot_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS headshot_pack_assets_updated_at ON public.headshot_pack_assets;
CREATE TRIGGER headshot_pack_assets_updated_at BEFORE UPDATE ON public.headshot_pack_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.headshot_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.headshot_pack_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS headshot_packs_owner_all ON public.headshot_packs;
CREATE POLICY headshot_packs_owner_all ON public.headshot_packs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS headshot_pack_assets_owner_all ON public.headshot_pack_assets;
CREATE POLICY headshot_pack_assets_owner_all ON public.headshot_pack_assets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.headshot_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.headshot_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
);
