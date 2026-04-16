CREATE TABLE IF NOT EXISTS public.social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'instagram')),
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    token_iv TEXT NOT NULL,
    token_auth_tag TEXT NOT NULL,
    refresh_iv TEXT,
    refresh_auth_tag TEXT,
    channel_name TEXT,
    channel_id TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, platform)
);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own connections" ON public.social_connections
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages connections" ON public.social_connections
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE INDEX IF NOT EXISTS idx_social_connections_user ON public.social_connections(user_id);
