-- Idempotency table for Stripe webhook events
-- Prevents duplicate processing across retries and supports multi-SaaS isolation
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  app_id TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- Service role only (bypasses RLS). No policies = no public access.
