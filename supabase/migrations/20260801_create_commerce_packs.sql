-- Amazon / Product Photography packs.
-- Parent packs retain user intent; child assets support partial success and
-- per-slot regeneration without re-running successful outputs.

CREATE TABLE IF NOT EXISTS public.commerce_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL DEFAULT 'amazon' CHECK (marketplace IN ('amazon')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  product_name TEXT NOT NULL CHECK (char_length(product_name) BETWEEN 1 AND 200),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 120),
  target_buyer TEXT CHECK (target_buyer IS NULL OR char_length(target_buyer) <= 300),
  source_url TEXT CHECK (source_url IS NULL OR source_url ~ '^https?://'),
  source_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_features JSONB NOT NULL DEFAULT '[]'::jsonb,
  preset TEXT NOT NULL DEFAULT 'minimal_studio'
    CHECK (preset IN ('minimal_studio', 'premium_dark', 'natural_lifestyle', 'modern_office')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'ready', 'partial', 'failed', 'archived')),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_packs_user_created
  ON public.commerce_packs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_pack_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.commerce_packs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('hero', 'lifestyle', 'feature', 'detail')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  attempt INT NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  provider_task_id TEXT CHECK (provider_task_id IS NULL OR char_length(provider_task_id) <= 300),
  image_url TEXT CHECK (image_url IS NULL OR image_url ~ '^https?://'),
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 4000),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pack_id, role)
);

CREATE INDEX IF NOT EXISTS commerce_pack_assets_pack_status
  ON public.commerce_pack_assets(pack_id, status);

DROP TRIGGER IF EXISTS commerce_packs_updated_at ON public.commerce_packs;
CREATE TRIGGER commerce_packs_updated_at BEFORE UPDATE ON public.commerce_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS commerce_pack_assets_updated_at ON public.commerce_pack_assets;
CREATE TRIGGER commerce_pack_assets_updated_at BEFORE UPDATE ON public.commerce_pack_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.commerce_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_pack_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commerce_packs_select ON public.commerce_packs;
CREATE POLICY commerce_packs_select ON public.commerce_packs FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS commerce_packs_insert ON public.commerce_packs;
CREATE POLICY commerce_packs_insert ON public.commerce_packs FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS commerce_packs_update ON public.commerce_packs;
CREATE POLICY commerce_packs_update ON public.commerce_packs FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS commerce_packs_delete ON public.commerce_packs;
CREATE POLICY commerce_packs_delete ON public.commerce_packs FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS commerce_pack_assets_select ON public.commerce_pack_assets;
CREATE POLICY commerce_pack_assets_select ON public.commerce_pack_assets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.commerce_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
);
DROP POLICY IF EXISTS commerce_pack_assets_insert ON public.commerce_pack_assets;
CREATE POLICY commerce_pack_assets_insert ON public.commerce_pack_assets FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.commerce_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
);
DROP POLICY IF EXISTS commerce_pack_assets_update ON public.commerce_pack_assets;
CREATE POLICY commerce_pack_assets_update ON public.commerce_pack_assets FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.commerce_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.commerce_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
);
DROP POLICY IF EXISTS commerce_pack_assets_delete ON public.commerce_pack_assets;
CREATE POLICY commerce_pack_assets_delete ON public.commerce_pack_assets FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.commerce_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
);

