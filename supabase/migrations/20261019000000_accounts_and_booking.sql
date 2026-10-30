-- Stage 2: accounts and roles, provider schedule, bookings.
--
-- Access model (see docs/decisions/0006):
-- * Reads go through GRANT + RLS, as before.
-- * Profile/service/schedule edits by owners: column-level GRANTs + RLS "owner" policies.
-- * Bookings are never written directly by clients. book_slot() and cancel_booking() are
--   SECURITY DEFINER functions that take the price from the database, check the slot against the
--   provider's schedule and the cancellation rule, and write atomically. A client calling the
--   REST API directly cannot pick their own price, status or an off-schedule time.
-- * Overlaps are prevented by an exclusion constraint, not by a "is it free?" check
--   (two concurrent requests could both pass such a check).
--
-- Business constants are mirrored in lib/booking/rules.ts; tests/rls checks they agree.

create extension if not exists btree_gist with schema extensions;

-- Helpers that RLS policies call. Kept out of the public schema so the Data API never exposes them.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------------------------

create type public.user_role as enum ('client', 'provider', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  full_name text not null default '' check (char_length(full_name) <= 80),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- Every new auth user gets a profile with role "client". Role changes happen only on the server.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80));
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.profiles to authenticated;
-- Column-level: users may change their name, never their role.
grant update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Providers and services: owners manage their own rows
-- ---------------------------------------------------------------------------------------------

create function private.is_valid_timezone(tz text) returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

alter table public.providers
  add constraint providers_timezone_valid check (private.is_valid_timezone(timezone));

create policy "Owners read their own provider profile"
  on public.providers for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "Owners update their own provider profile"
  on public.providers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Not granted: slug (stable public URL), status (admin only), user_id, photo_url (upload later).
grant update (
  display_name, headline, bio, category, city, timezone,
  offers_online, offers_in_person, years_experience, languages
) on public.providers to authenticated;

create function private.owns_provider(p_provider_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.providers where id = p_provider_id and user_id = (select auth.uid())
  );
$$;
revoke execute on function private.owns_provider(uuid) from public;
grant execute on function private.owns_provider(uuid) to authenticated;

create policy "Owners read all their services"
  on public.services for select to authenticated
  using ((select private.owns_provider(provider_id)) or (select private.is_admin()));

create policy "Owners add services"
  on public.services for insert to authenticated
  with check ((select private.owns_provider(provider_id)));

create policy "Owners update their services"
  on public.services for update to authenticated
  using ((select private.owns_provider(provider_id)))
  with check ((select private.owns_provider(provider_id)));

-- Services are disabled (active = false), never deleted: bookings keep referencing them.
grant insert (provider_id, title, description, duration_min, price_cents, active)
  on public.services to authenticated;
grant update (title, description, duration_min, price_cents, active)
  on public.services to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Weekly schedule and exceptions (in the provider's local time)
-- ---------------------------------------------------------------------------------------------

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  -- ISO weekday: 1 = Monday … 7 = Sunday.
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint availability_rules_order check (start_time < end_time),
  -- Working hours on the same weekday must not overlap.
  constraint availability_rules_no_overlap exclude using gist (
    provider_id with =,
    weekday with =,
    int4range(extract(epoch from start_time)::int, extract(epoch from end_time)::int) with &&
  )
);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  date date not null,
  -- Both null = the whole day is off; otherwise only this interval is off.
  start_time time,
  end_time time,
  reason text not null default '' check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  constraint availability_exceptions_interval check (
    (start_time is null and end_time is null) or (start_time < end_time)
  )
);

create index availability_rules_provider_idx on public.availability_rules (provider_id);
create index availability_exceptions_provider_date_idx on public.availability_exceptions (provider_id, date);

alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;

-- Clients need the schedule to see free slots, but only for published providers.
create policy "Schedules of approved providers are public"
  on public.availability_rules for select to anon, authenticated
  using (exists (
    select 1 from public.providers p where p.id = provider_id and p.status = 'approved'
  ));
create policy "Owners manage their schedule"
  on public.availability_rules for all to authenticated
  using ((select private.owns_provider(provider_id)))
  with check ((select private.owns_provider(provider_id)));

create policy "Exceptions of approved providers are public"
  on public.availability_exceptions for select to anon, authenticated
  using (exists (
    select 1 from public.providers p where p.id = provider_id and p.status = 'approved'
  ));
create policy "Owners manage their exceptions"
  on public.availability_exceptions for all to authenticated
  using ((select private.owns_provider(provider_id)))
  with check ((select private.owns_provider(provider_id)));

grant select on public.availability_rules, public.availability_exceptions to anon, authenticated;
grant insert, update, delete on public.availability_rules, public.availability_exceptions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------------------------

create type public.booking_status as enum (
  'pending_payment', 'confirmed', 'cancelled', 'completed', 'expired'
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  client_id uuid not null references auth.users (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'confirmed',
  -- Snapshots at booking time: history stays correct even if the service or profile changes later.
  price_cents integer not null check (price_cents >= 0),
  currency char(3) not null,
  service_title text not null,
  duration_min integer not null,
  provider_name text not null,
  provider_timezone text not null,
  client_name text not null,
  client_email text not null,
  -- Stage 3 (payments).
  expires_at timestamptz,
  stripe_checkout_session_id text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint bookings_time_order check (starts_at < ends_at),
  -- The double-booking guarantee lives in the database. '[)' allows back-to-back bookings.
  constraint bookings_no_overlap exclude using gist (
    provider_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending_payment', 'confirmed'))
);

create index bookings_client_idx on public.bookings (client_id, starts_at);
create index bookings_provider_idx on public.bookings (provider_id, starts_at);

alter table public.bookings enable row level security;

create policy "Clients read their bookings"
  on public.bookings for select to authenticated
  using (client_id = (select auth.uid()));
create policy "Providers read bookings with them"
  on public.bookings for select to authenticated
  using ((select private.owns_provider(provider_id)));
create policy "Admins read all bookings"
  on public.bookings for select to authenticated
  using ((select private.is_admin()));

-- Read-only for users. All writes go through the functions below.
grant select on public.bookings to authenticated;

-- Busy intervals of a provider for slot calculation, without exposing who booked them.
create function public.provider_busy_intervals(
  p_provider_id uuid, p_from timestamptz, p_to timestamptz
) returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.starts_at, b.ends_at
  from public.bookings b
  join public.providers p on p.id = b.provider_id and p.status = 'approved'
  where b.provider_id = p_provider_id
    and b.status in ('pending_payment', 'confirmed')
    and b.starts_at < p_to and b.ends_at > p_from
    and p_to - p_from <= interval '62 days';
$$;
revoke execute on function public.provider_busy_intervals(uuid, timestamptz, timestamptz) from public;
grant execute on function public.provider_busy_intervals(uuid, timestamptz, timestamptz) to anon, authenticated;

-- Creates a confirmed booking for the signed-in user. Errors (message = machine-readable code):
-- not_authenticated, service_not_found, own_service, slot_unavailable, slot_taken.
create function public.book_slot(p_service_id uuid, p_starts_at timestamptz)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_service public.services;
  v_provider public.providers;
  v_ends timestamptz;
  v_local timestamp;
  v_local_end timestamp;
  v_booking public.bookings;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_service from public.services where id = p_service_id and active;
  if not found then
    raise exception 'service_not_found';
  end if;
  select * into v_provider from public.providers
    where id = v_service.provider_id and status = 'approved';
  if not found then
    raise exception 'service_not_found';
  end if;
  if v_provider.user_id = v_user then
    raise exception 'own_service';
  end if;

  -- lib/booking/rules.ts: MIN_NOTICE_MINUTES = 60, MAX_ADVANCE_DAYS = 60, SLOT_STEP_MINUTES = 30.
  if p_starts_at < now() + interval '60 minutes' or p_starts_at > now() + interval '60 days' then
    raise exception 'slot_unavailable';
  end if;

  v_ends := p_starts_at + make_interval(mins => v_service.duration_min);
  v_local := p_starts_at at time zone v_provider.timezone;
  v_local_end := v_ends at time zone v_provider.timezone;

  -- Inside one working-hours rule of that local weekday, on the 30-minute grid.
  if not exists (
    select 1 from public.availability_rules r
    where r.provider_id = v_provider.id
      and r.weekday = extract(isodow from v_local)
      and v_local_end::date = v_local::date
      and v_local::time >= r.start_time
      and v_local_end::time <= r.end_time
      and extract(epoch from (v_local::time - r.start_time))::int % (30 * 60) = 0
  ) then
    raise exception 'slot_unavailable';
  end if;

  -- Not inside a day off or a blocked interval.
  if exists (
    select 1 from public.availability_exceptions e
    where e.provider_id = v_provider.id
      and e.date = v_local::date
      and (e.start_time is null or (v_local::time < e.end_time and v_local_end::time > e.start_time))
  ) then
    raise exception 'slot_unavailable';
  end if;

  begin
    insert into public.bookings (
      provider_id, client_id, service_id, starts_at, ends_at, status,
      price_cents, currency, service_title, duration_min,
      provider_name, provider_timezone, client_name, client_email
    )
    select
      v_provider.id, v_user, v_service.id, p_starts_at, v_ends, 'confirmed',
      v_service.price_cents, v_service.currency, v_service.title, v_service.duration_min,
      v_provider.display_name, v_provider.timezone,
      coalesce(nullif(pr.full_name, ''), u.email), u.email
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    where u.id = v_user
    returning * into v_booking;
  exception when exclusion_violation then
    -- Someone else took an overlapping slot between "show slots" and "confirm".
    raise exception 'slot_taken';
  end;

  return v_booking;
end;
$$;
revoke execute on function public.book_slot(uuid, timestamptz) from public;
grant execute on function public.book_slot(uuid, timestamptz) to authenticated;

-- Cancels a booking. Clients: free cancellation only 24 hours or more before the start
-- (lib/booking/rules.ts: CLIENT_CANCELLATION_HOURS). The provider (or an admin) can cancel any
-- upcoming booking. Errors: not_authenticated, booking_not_found, not_cancellable, too_late_to_cancel.
create function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_booking public.bookings;
  v_is_client boolean;
  v_is_provider boolean;
  v_is_admin boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found';
  end if;

  v_is_client := v_booking.client_id = v_user;
  v_is_provider := exists (
    select 1 from public.providers where id = v_booking.provider_id and user_id = v_user
  );
  v_is_admin := exists (select 1 from public.profiles where id = v_user and role = 'admin');
  -- Same answer for "does not exist" and "not yours": no hint that the booking exists.
  if not (v_is_client or v_is_provider or v_is_admin) then
    raise exception 'booking_not_found';
  end if;

  if v_booking.status not in ('pending_payment', 'confirmed') or v_booking.starts_at <= now() then
    raise exception 'not_cancellable';
  end if;
  if v_is_client and not (v_is_provider or v_is_admin)
     and v_booking.starts_at < now() + interval '24 hours' then
    raise exception 'too_late_to_cancel';
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_user
  where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end;
$$;
revoke execute on function public.cancel_booking(uuid) from public;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- "Become a provider": creates a pending provider profile for the signed-in user and switches
-- their role. Approval (status = approved) is an admin action (stage 5). Errors: not_authenticated,
-- already_provider, invalid_timezone.
create function public.apply_as_provider(
  p_display_name text,
  p_headline text,
  p_bio text,
  p_category public.provider_category,
  p_city text,
  p_timezone text,
  p_offers_online boolean,
  p_offers_in_person boolean
) returns public.providers
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_provider public.providers;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.providers where user_id = v_user) then
    raise exception 'already_provider';
  end if;
  if not private.is_valid_timezone(p_timezone) then
    raise exception 'invalid_timezone';
  end if;

  -- Same shape as seed slugs: "<first name>-<category>", then -2, -3… if taken.
  v_base := regexp_replace(lower(split_part(trim(p_display_name), ' ', 1)), '[^a-z0-9]', '', 'g');
  if v_base = '' then
    v_base := 'pro';
  end if;
  v_base := v_base || '-' || p_category::text;
  v_slug := v_base;
  while exists (select 1 from public.providers where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.providers (
    user_id, slug, display_name, headline, bio, category, city, timezone,
    offers_online, offers_in_person, status
  ) values (
    v_user, v_slug, trim(p_display_name), trim(p_headline), trim(p_bio), p_category,
    trim(p_city), p_timezone, p_offers_online, p_offers_in_person, 'pending'
  ) returning * into v_provider;

  update public.profiles set role = 'provider' where id = v_user and role = 'client';
  return v_provider;
end;
$$;
revoke execute on function public.apply_as_provider(
  text, text, text, public.provider_category, text, text, boolean, boolean
) from public;
grant execute on function public.apply_as_provider(
  text, text, text, public.provider_category, text, text, boolean, boolean
) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Server role (webhooks, background jobs, seed scripts — stage 3+). With "Automatically expose
-- new tables" off it has no privileges by default either.
-- ---------------------------------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
