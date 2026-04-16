-- Engine Management tables for DB-driven engine configuration
-- Session 1/4 of Admin Model Management refactor

CREATE TABLE IF NOT EXISTS public.engines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('api', 'modal_local')),
    status TEXT NOT NULL DEFAULT 'coming_soon' CHECK (status IN ('active', 'coming_soon', 'deprecated')),
    max_duration INTEGER NOT NULL,
    gpu TEXT,
    clip_duration NUMERIC,
    priority INTEGER DEFAULT 100,
    api_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.engine_plans (
    engine_id TEXT REFERENCES public.engines(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'premium')),
    PRIMARY KEY (engine_id, plan)
);

CREATE TABLE IF NOT EXISTS public.engine_costs (
    engine_id TEXT PRIMARY KEY REFERENCES public.engines(id) ON DELETE CASCADE,
    billing_model TEXT NOT NULL CHECK (billing_model IN ('per_second', 'per_video')),
    per_second_usd NUMERIC,
    per_video_usd NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.engine_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engine_id TEXT REFERENCES public.engines(id) ON DELETE CASCADE,
    secret_name TEXT NOT NULL,
    secret_value_encrypted TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(engine_id, secret_name)
);

CREATE INDEX IF NOT EXISTS idx_engines_status ON public.engines(status);
CREATE INDEX IF NOT EXISTS idx_engines_priority ON public.engines(priority DESC);
CREATE INDEX IF NOT EXISTS idx_engine_plans_plan ON public.engine_plans(plan);

ALTER TABLE public.engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read engines" ON public.engines FOR SELECT USING (true);
CREATE POLICY "Service role manages engines" ON public.engines FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Anyone can read engine_plans" ON public.engine_plans FOR SELECT USING (true);
CREATE POLICY "Service role manages engine_plans" ON public.engine_plans FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Anyone can read engine_costs" ON public.engine_costs FOR SELECT USING (true);
CREATE POLICY "Service role manages engine_costs" ON public.engine_costs FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role accesses engine_secrets" ON public.engine_secrets FOR ALL USING (auth.jwt()->>'role' = 'service_role');

INSERT INTO public.engines (id, name, type, status, max_duration, gpu, clip_duration, priority)
VALUES
    ('wan_i2v', 'Wan 2.2 I2V', 'modal_local', 'active', 60, 'A100-80GB', 5.0, 100),
    ('seedance', 'Seedance 2.0', 'api', 'active', 15, NULL, NULL, 90),
    ('kling', 'Kling 2.0', 'api', 'coming_soon', 60, NULL, NULL, 80)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.engine_plans (engine_id, plan)
VALUES
    ('wan_i2v', 'free'), ('wan_i2v', 'pro'), ('wan_i2v', 'premium'),
    ('seedance', 'pro'), ('seedance', 'premium'),
    ('kling', 'pro'), ('kling', 'premium')
ON CONFLICT DO NOTHING;

INSERT INTO public.engine_costs (engine_id, billing_model, per_second_usd)
VALUES
    ('wan_i2v', 'per_second', 0.015),
    ('seedance', 'per_second', 0.025)
ON CONFLICT (engine_id) DO NOTHING;
