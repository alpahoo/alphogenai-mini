-- T-1108: AlphoResearch watchlists + changedetection events.
-- No seeded data. No auto-generation. Webhooks create draft research jobs only.

CREATE TABLE IF NOT EXISTS public.research_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  topic TEXT NOT NULL CHECK (char_length(topic) BETWEEN 3 AND 500),
  url TEXT NOT NULL CHECK (url ~ '^https?://'),
  mode TEXT NOT NULL DEFAULT 'news' CHECK (mode IN ('news', 'tutorial', 'product', 'competitor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  last_checked_at TIMESTAMPTZ,
  last_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_watchlists_user_id_updated_at
  ON public.research_watchlists(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS research_watchlists_status
  ON public.research_watchlists(status);
CREATE UNIQUE INDEX IF NOT EXISTS research_watchlists_user_url_unique
  ON public.research_watchlists(user_id, url);

ALTER TABLE public.research_watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_watchlists_user_select ON public.research_watchlists;
CREATE POLICY research_watchlists_user_select ON public.research_watchlists
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS research_watchlists_user_insert ON public.research_watchlists;
CREATE POLICY research_watchlists_user_insert ON public.research_watchlists
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS research_watchlists_user_update ON public.research_watchlists;
CREATE POLICY research_watchlists_user_update ON public.research_watchlists
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS research_watchlists_user_delete ON public.research_watchlists;
CREATE POLICY research_watchlists_user_delete ON public.research_watchlists
  FOR DELETE USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.research_watchlist_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES public.research_watchlists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  research_job_id UUID REFERENCES public.research_jobs(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL CHECK (source_url ~ '^https?://'),
  title TEXT CHECK (title IS NULL OR char_length(title) <= 300),
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 2000),
  change_url TEXT CHECK (change_url IS NULL OR change_url ~ '^https?://'),
  snapshot_url TEXT CHECK (snapshot_url IS NULL OR snapshot_url ~ '^https?://'),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'draft_created', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_watchlist_events_user_id_created_at
  ON public.research_watchlist_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_watchlist_events_watchlist_id_created_at
  ON public.research_watchlist_events(watchlist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_watchlist_events_status
  ON public.research_watchlist_events(status);

ALTER TABLE public.research_watchlist_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_watchlist_events_user_select ON public.research_watchlist_events;
CREATE POLICY research_watchlist_events_user_select ON public.research_watchlist_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS research_watchlist_events_user_update ON public.research_watchlist_events;
CREATE POLICY research_watchlist_events_user_update ON public.research_watchlist_events
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS research_watchlist_events_user_delete ON public.research_watchlist_events;
CREATE POLICY research_watchlist_events_user_delete ON public.research_watchlist_events
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_research_watchlists_updated_at ON public.research_watchlists;
CREATE TRIGGER trg_research_watchlists_updated_at
  BEFORE UPDATE ON public.research_watchlists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
