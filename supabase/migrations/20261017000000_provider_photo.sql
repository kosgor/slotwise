-- Provider photo. Stage 1: a path under /public; from stage 2 a Supabase Storage URL.
-- A new migration instead of editing 20261016000000_catalog.sql: applied migrations are never changed.

alter table public.providers
  add column photo_url text
  check (photo_url is null or photo_url ~ '^(/|https://)');

-- New columns may only be appended to an existing view, so photo_url goes last.
-- security_invoker must be repeated: create or replace resets view options.
create or replace view public.catalog_providers
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.display_name,
  p.headline,
  p.bio,
  p.category,
  p.city,
  p.timezone,
  p.offers_online,
  p.offers_in_person,
  p.years_experience,
  p.languages,
  p.updated_at,
  s.min_price_cents,
  s.currency,
  r.rating_avg,
  coalesce(r.review_count, 0) as review_count,
  p.photo_url
from public.providers p
join lateral (
  select min(price_cents) as min_price_cents, min(currency) as currency
  from public.services
  where provider_id = p.id and active
) s on s.min_price_cents is not null
left join lateral (
  select round(avg(rating)::numeric, 1) as rating_avg, count(*)::integer as review_count
  from public.reviews
  where provider_id = p.id and not hidden
) r on true
where p.status = 'approved';
