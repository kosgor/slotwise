-- Stage 1: public catalog — providers, their services and reviews. Read-only for everyone.
-- Write policies for providers (own profile, own services) arrive in stage 2 with auth.
-- Field names mirror lib/catalog/types.ts (snake_case here, camelCase in TypeScript).

create type public.provider_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.provider_category as enum ('tutoring', 'fitness', 'yoga', 'coaching', 'massage', 'music');

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  -- Nullable in stage 1: demo providers have no auth account yet.
  user_id uuid unique references auth.users (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  headline text not null check (char_length(headline) <= 120),
  bio text not null default '' check (char_length(bio) <= 2000),
  category public.provider_category not null,
  city text not null,
  timezone text not null,
  offers_online boolean not null default false,
  offers_in_person boolean not null default false,
  years_experience smallint not null default 0 check (years_experience >= 0),
  languages text[] not null default '{}',
  status public.provider_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_offers_some_format check (offers_online or offers_in_person)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  duration_min integer not null check (duration_min between 5 and 480),
  -- Money in integer cents: no floating point rounding.
  price_cents integer not null check (price_cents >= 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) <= 2000),
  -- Moderation (stage 5): hidden reviews never reach the public catalog.
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index providers_category_idx on public.providers (category) where status = 'approved';
create index providers_city_idx on public.providers (city) where status = 'approved';
create index services_provider_id_idx on public.services (provider_id);
create index reviews_provider_id_idx on public.reviews (provider_id);

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

-- Row Level Security. Supabase exposes these tables to the browser with the anon key,
-- so the policies below are the real access control, not the UI.
alter table public.providers enable row level security;
alter table public.services enable row level security;
alter table public.reviews enable row level security;

create policy "Approved providers are public"
  on public.providers for select
  to anon, authenticated
  using (status = 'approved');

create policy "Active services of approved providers are public"
  on public.services for select
  to anon, authenticated
  using (
    active
    and exists (
      select 1 from public.providers p
      where p.id = services.provider_id and p.status = 'approved'
    )
  );

create policy "Visible reviews of approved providers are public"
  on public.reviews for select
  to anon, authenticated
  using (
    not hidden
    and exists (
      select 1 from public.providers p
      where p.id = reviews.provider_id and p.status = 'approved'
    )
  );

-- No insert/update/delete policies: with RLS enabled that means nobody but the service role can write.

-- Catalog cards with aggregates. security_invoker = true makes the view run with the caller's
-- permissions, so the RLS policies above still apply. Without it a view runs as its owner
-- and silently bypasses RLS.
create view public.catalog_providers
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
  coalesce(r.review_count, 0) as review_count
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
