-- RPC functions to fetch pending daily themes up to CURRENT_DATE
-- Ensures comparison is done in PostgreSQL timezone context, not client

create or replace function public.get_pending_daily_themes()
returns setof public.daily_themes
language sql
stable
security definer
set search_path = public as $$
  select *
  from public.daily_themes
  where status = 'pending'
    and scheduled_date <= current_date
  order by scheduled_date asc;
$$;

-- Backward-compatible alias used by some environments
create or replace function public.daily_themes_pending_up_to_today()
returns setof public.daily_themes
language sql
stable
security definer
set search_path = public as $$
  select *
  from public.daily_themes
  where status = 'pending'
    and scheduled_date <= current_date
  order by scheduled_date asc;
$$;
