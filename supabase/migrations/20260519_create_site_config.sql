-- Site-level design configuration (single-row table)
-- Used by the Admin Template page for design customization.

CREATE TABLE IF NOT EXISTS site_config (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforce single row
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- Seed with empty config (falls back to defaults in the app)
INSERT INTO site_config (id, config)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- RLS: service role only (admin API uses service client)
ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

-- Allow public read via service role or anon (config is non-sensitive)
CREATE POLICY "site_config_read" ON site_config
  FOR SELECT USING (true);

-- Only service role can update
CREATE POLICY "site_config_write" ON site_config
  FOR ALL USING (auth.role() = 'service_role');
