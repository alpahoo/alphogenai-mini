-- Mini seed — catalog podcast personas (T-1136-seed).
-- Data seed, NOT a schema migration. Apply via the Supabase SQL editor
-- (project qbrpzmuedfugbhoeytdj) AFTER the portrait PNGs are deployed to Vercel
-- (they're served from public/podcast-personas/*.png → alphogen.com/...).
--
-- Portraits are AlphoGen-owned, generated, stylized illustrations (NOT real
-- people) — see scripts/gen_podcast_catalog_portraits.py. Names are fictional
-- (they pass screenPersonaName / content-policy).
--
-- Idempotent: re-running won't duplicate (guarded by name for catalog rows).

insert into public.podcast_personas (user_id, source_kind, name, portrait_path, status)
select null, 'catalog', v.name, v.portrait_path, 'active'
from (values
  ('Maya Rivers', 'https://www.alphogen.com/podcast-personas/maya-rivers.png'),
  ('Leo Bennett', 'https://www.alphogen.com/podcast-personas/leo-bennett.png'),
  ('Aria Chen',   'https://www.alphogen.com/podcast-personas/aria-chen.png'),
  ('Sam Delgado', 'https://www.alphogen.com/podcast-personas/sam-delgado.png')
) as v(name, portrait_path)
where not exists (
  select 1 from public.podcast_personas p
  where p.user_id is null and p.source_kind = 'catalog' and p.name = v.name
);

-- Verify:
-- select id, name, portrait_path from public.podcast_personas
-- where user_id is null and source_kind = 'catalog' order by name;


-- ── OPTIONAL: assign two catalog personas to a TEST podcast for QA ───────────
-- Replace <PODCAST_ID> with a real podcast you own, then run. Host → Maya,
-- Guest → Leo. Re-render afterwards to see the non-fallback portrait path.
--
-- with cat as (
--   select
--     (select id from public.podcast_personas where user_id is null and name = 'Maya Rivers' limit 1) as host_persona,
--     (select id from public.podcast_personas where user_id is null and name = 'Leo Bennett' limit 1) as guest_persona
-- )
-- update public.podcast_speakers s
-- set persona_id = case s.role
--   when 'host'  then (select host_persona  from cat)
--   when 'guest' then (select guest_persona from cat)
-- end
-- from cat
-- where s.podcast_id = '<PODCAST_ID>' and s.role in ('host', 'guest');
