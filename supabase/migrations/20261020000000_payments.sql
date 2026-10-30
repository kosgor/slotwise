-- Stage 3: paid bookings (Stripe Checkout), provider subscriptions, webhook bookkeeping.
--
-- * A paid booking starts as a 15-minute hold (pending_payment + expires_at). The hold blocks the
--   slot (bookings_no_overlap) until it is paid, released or expires.
-- * Stripe tells us about payments through webhooks. Each webhook effect is one function below:
--   it records the event id in stripe_events and changes the data in the same transaction, so a
--   repeated delivery is recognised and changes nothing.
-- * Users never write payments, subscriptions or events. Only the server (service_role) does.

-- ---------------------------------------------------------------------------------------------
-- Bookings: payment hold and paid/refunded amounts
-- ---------------------------------------------------------------------------------------------

-- What the client paid and got back, kept on the booking so clients and providers can see it
-- (payments itself is server-only). Updated by the webhook functions.
alter table public.bookings
  add column paid_cents integer not null default 0 check (paid_cents >= 0),
  add column refunded_cents integer not null default 0 check (refunded_cents >= 0),
  add constraint bookings_refund_not_above_paid check (refunded_cents <= paid_cents);

alter table public.bookings alter column status set default 'pending_payment';

create unique index bookings_checkout_session_key
  on public.bookings (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
-- The expiry job looks for holds whose time is up.
create index bookings_pending_expiry_idx
  on public.bookings (expires_at) where status = 'pending_payment';

-- ---------------------------------------------------------------------------------------------
-- Payments (server only)
-- ---------------------------------------------------------------------------------------------

create type public.payment_status as enum ('succeeded', 'partially_refunded', 'refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  -- unique: the same payment can never be recorded twice, whatever arrives from Stripe.
  stripe_payment_intent_id text not null unique,
  stripe_checkout_session_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency char(3) not null,
  status public.payment_status not null default 'succeeded',
  refunded_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_refund_not_above_amount check (refunded_cents between 0 and amount_cents)
);
create index payments_booking_idx on public.payments (booking_id);
alter table public.payments enable row level security;
-- No policies and no grants to anon/authenticated: invisible through the Data API.
grant select, insert, update, delete on public.payments to service_role;

-- ---------------------------------------------------------------------------------------------
-- Stripe events (server only): one row per processed webhook event = idempotency
-- ---------------------------------------------------------------------------------------------

create table public.stripe_events (
  id text primary key, -- Stripe event id (evt_…)
  type text not null,
  -- What the handler did: confirmed, duplicate, refund_needed, … (for debugging and the drills).
  result text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.stripe_events enable row level security;
grant select, insert, update, delete on public.stripe_events to service_role;

-- ---------------------------------------------------------------------------------------------
-- Provider subscriptions: Free / Pro
-- ---------------------------------------------------------------------------------------------

create type public.subscription_plan as enum ('free', 'pro');

-- One row per provider that has ever opened billing. No row = Free.
create table public.provider_subscriptions (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  plan public.subscription_plan not null default 'free',
  -- Stripe's subscription status (active, past_due, canceled, …) or 'none' before the first one.
  status text not null default 'none',
  price_lookup_key text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.provider_subscriptions enable row level security;

create policy "Providers and admins read subscriptions"
  on public.provider_subscriptions for select to authenticated
  using ((select private.owns_provider(provider_id)) or (select private.is_admin()));
grant select on public.provider_subscriptions to authenticated;
grant select, insert, update, delete on public.provider_subscriptions to service_role;

-- Plan whose limits apply now. Pro counts only while Stripe says the subscription is in good
-- standing: past_due, unpaid or canceled fall back to Free limits (lib/billing/plans.ts).
create function private.provider_plan(p_provider_id uuid)
returns public.subscription_plan
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select 'pro'::public.subscription_plan
    from public.provider_subscriptions s
    where s.provider_id = p_provider_id
      and s.plan = 'pro'
      and s.status in ('active', 'trialing')
  ), 'free');
$$;
revoke execute on function private.provider_plan(uuid) from public;
grant execute on function private.provider_plan(uuid) to authenticated, service_role;

-- Free plan: up to 3 active services (lib/billing/plans.ts: FREE_SERVICE_LIMIT). Checked in the
-- database, so neither a hidden button nor a direct REST call can get around it. Existing
-- services stay active after a downgrade; only adding or re-activating one is blocked.
-- An AFTER trigger: row-level security has already accepted the row, so a stranger gets the RLS
-- error, not a hint about someone else's plan. Raising here rolls the statement back.
create function private.enforce_service_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active)
     and private.provider_plan(new.provider_id) = 'free'
     and (
       select count(*) from public.services s where s.provider_id = new.provider_id and s.active
     ) > 3 then
    raise exception 'plan_limit';
  end if;
  return null;
end;
$$;
revoke execute on function private.enforce_service_limit() from public;

create trigger services_plan_limit
  after insert or update of active on public.services
  for each row execute function private.enforce_service_limit();

-- ---------------------------------------------------------------------------------------------
-- Booking functions, updated for payment holds
-- ---------------------------------------------------------------------------------------------

-- Busy = confirmed, or a hold whose 15 minutes are not over yet. A stale hold does not block the
-- slot even before the expiry job has marked it.
create or replace function public.provider_busy_intervals(
  p_provider_id uuid, p_from timestamptz, p_to timestamptz
) returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.starts_at, b.ends_at
  from public.bookings b
  join public.providers p on p.id = b.provider_id and p.status = 'approved'
  where b.provider_id = p_provider_id
    and (b.status = 'confirmed' or (b.status = 'pending_payment' and b.expires_at > now()))
    and b.starts_at < p_to and b.ends_at > p_from
    and p_to - p_from <= interval '62 days';
$$;

-- Creates a booking for the signed-in user: a free service is confirmed at once, a paid one is
-- held for 15 minutes (lib/booking/rules.ts: PAYMENT_HOLD_MINUTES) until Stripe confirms payment.
-- Errors: not_authenticated, service_not_found, own_service, slot_unavailable, slot_taken,
-- too_many_holds.
create or replace function public.book_slot(p_service_id uuid, p_starts_at timestamptz)
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
  v_paid boolean;
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

  v_paid := v_service.price_cents > 0;

  -- One person cannot block a provider's week with unpaid holds.
  -- lib/booking/rules.ts: MAX_ACTIVE_HOLDS = 3.
  if v_paid and (
    select count(*) from public.bookings
    where client_id = v_user and status = 'pending_payment' and expires_at > now()
  ) >= 3 then
    raise exception 'too_many_holds';
  end if;

  -- A hold whose time is up still counts for bookings_no_overlap until it is marked expired.
  -- Mark the ones in the way now instead of waiting for the expiry job.
  update public.bookings
  set status = 'expired'
  where provider_id = v_provider.id
    and status = 'pending_payment'
    and expires_at <= now()
    and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, v_ends, '[)');

  begin
    insert into public.bookings (
      provider_id, client_id, service_id, starts_at, ends_at, status, expires_at,
      price_cents, currency, service_title, duration_min,
      provider_name, provider_timezone, client_name, client_email
    )
    select
      v_provider.id, v_user, v_service.id, p_starts_at, v_ends,
      case when v_paid then 'pending_payment' else 'confirmed' end::public.booking_status,
      case when v_paid then now() + interval '15 minutes' end,
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

-- Cancels a booking. Clients: a paid booking can be cancelled for free (with a full refund) only
-- 24 hours or more before the start (lib/booking/rules.ts: CLIENT_CANCELLATION_HOURS); an unpaid
-- hold can always be released. The provider (or an admin) can cancel any upcoming booking.
-- The refund itself is a Stripe call made by the server after this succeeds.
-- Errors: not_authenticated, booking_not_found, not_cancellable, too_late_to_cancel.
create or replace function public.cancel_booking(p_booking_id uuid)
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
     and v_booking.status = 'confirmed'
     and v_booking.starts_at < now() + interval '24 hours' then
    raise exception 'too_late_to_cancel';
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_user, expires_at = null
  where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end;
$$;

-- "I need more time": the client extends their own hold by up to 15 minutes, but never past
-- 25 minutes after it was created — the Stripe Checkout page itself closes after 30 minutes.
-- (WCAG 2.2.1: a time limit the user can extend.) Errors: booking_not_found, hold_expired,
-- hold_not_extendable.
create function public.extend_payment_hold(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_new_expiry timestamptz;
begin
  select * into v_booking from public.bookings
    where id = p_booking_id and client_id = auth.uid() for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.status <> 'pending_payment' or v_booking.expires_at <= now() then
    raise exception 'hold_expired';
  end if;

  v_new_expiry := least(now() + interval '15 minutes', v_booking.created_at + interval '25 minutes');
  if v_new_expiry <= v_booking.expires_at then
    raise exception 'hold_not_extendable';
  end if;

  update public.bookings set expires_at = v_new_expiry where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end;
$$;
revoke execute on function public.extend_payment_hold(uuid) from public;
grant execute on function public.extend_payment_hold(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Webhook effects (service_role only). Each one:
--   1. inserts the Stripe event id; if it is already there, returns 'duplicate' and does nothing;
--   2. applies the change;
--   3. stores the result on the event row.
-- All in one transaction: either the event is recorded AND the data changed, or neither.
-- ---------------------------------------------------------------------------------------------

create function private.claim_stripe_event(p_event_id text, p_type text)
returns boolean
language plpgsql set search_path = ''
as $$
begin
  insert into public.stripe_events (id, type) values (p_event_id, p_type)
  on conflict (id) do nothing;
  return found;
end;
$$;

create function private.finish_stripe_event(p_event_id text, p_result text)
returns text
language sql set search_path = ''
as $$
  update public.stripe_events set result = p_result, processed_at = now() where id = p_event_id;
  select p_result;
$$;

-- checkout.session.completed for a booking. Results:
--   confirmed         — the hold became a confirmed booking;
--   already_confirmed — nothing to do (e.g. a second session for the same booking);
--   refund_needed     — the money arrived but the booking cannot be kept: it was cancelled, or the
--                       hold expired and someone else booked the slot, or the amount is wrong.
--                       The server refunds it (background job);
--   duplicate         — this event was processed before.
create function public.stripe_checkout_completed(
  p_event_id text,
  p_event_type text,
  p_booking_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_currency text
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_new_payment boolean;
  v_result text;
begin
  if not private.claim_stripe_event(p_event_id, p_event_type) then
    return 'duplicate';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    -- Raise, not return: the event row is rolled back too, and Stripe retries later.
    raise exception 'booking_not_found';
  end if;

  insert into public.payments (
    booking_id, stripe_payment_intent_id, stripe_checkout_session_id, amount_cents, currency
  ) values (
    p_booking_id, p_payment_intent_id, p_session_id, p_amount_cents, upper(p_currency)
  ) on conflict (stripe_payment_intent_id) do nothing;
  v_new_payment := found;

  update public.bookings
  set paid_cents = paid_cents + case when v_new_payment then p_amount_cents else 0 end
  where id = p_booking_id
  returning * into v_booking;

  if v_booking.status = 'confirmed' then
    v_result := 'already_confirmed';
  elsif v_booking.status not in ('pending_payment', 'expired')
     or p_amount_cents <> v_booking.price_cents
     or upper(p_currency) <> v_booking.currency then
    v_result := 'refund_needed';
  else
    -- pending_payment → confirmed always fits (the hold already occupied the slot).
    -- expired → confirmed only if nobody has taken the slot in the meantime.
    begin
      update public.bookings
      set status = 'confirmed', expires_at = null, stripe_checkout_session_id = p_session_id
      where id = p_booking_id;
      v_result := 'confirmed';
    exception when exclusion_violation then
      v_result := 'refund_needed';
    end;
  end if;

  return private.finish_stripe_event(p_event_id, v_result);
end;
$$;

-- checkout.session.expired: the client never paid. Results: expired, ignored (already paid,
-- cancelled or expired — the order of events does not matter), duplicate.
create function public.stripe_checkout_expired(
  p_event_id text, p_event_type text, p_booking_id uuid
) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.claim_stripe_event(p_event_id, p_event_type) then
    return 'duplicate';
  end if;
  update public.bookings set status = 'expired'
  where id = p_booking_id and status = 'pending_payment';
  return private.finish_stripe_event(p_event_id, case when found then 'expired' else 'ignored' end);
end;
$$;

-- charge.refunded: p_refunded_cents is the charge's TOTAL refunded amount from Stripe, not this
-- refund's amount, so applying an old event after a newer one cannot lower it.
-- Returns the booking id, or null for a duplicate. Raises payment_not_found if the payment has
-- not been recorded yet (refund event before the payment event): Stripe retries later.
create function public.stripe_charge_refunded(
  p_event_id text, p_event_type text, p_payment_intent_id text, p_refunded_cents integer
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if not private.claim_stripe_event(p_event_id, p_event_type) then
    return null;
  end if;

  update public.payments
  set refunded_cents = greatest(refunded_cents, least(p_refunded_cents, amount_cents)),
      updated_at = now()
  where stripe_payment_intent_id = p_payment_intent_id
  returning * into v_payment;
  if not found then
    raise exception 'payment_not_found';
  end if;

  update public.payments
  set status = case when refunded_cents >= amount_cents then 'refunded' else 'partially_refunded' end::public.payment_status
  where id = v_payment.id;

  -- A booking can have several payments only in the "paid twice" edge case; sum them all.
  update public.bookings b
  set refunded_cents = (select coalesce(sum(p.refunded_cents), 0) from public.payments p where p.booking_id = b.id)
  where b.id = v_payment.booking_id;

  perform private.finish_stripe_event(p_event_id, 'refunded');
  return v_payment.booking_id;
end;
$$;

-- customer.subscription.* / invoice.payment_failed: the caller passes the subscription state it
-- has just read from Stripe (not the possibly stale copy inside the event), so events arriving in
-- any order end with the current state. Results: synced, duplicate.
create function public.stripe_sync_subscription(
  p_event_id text,
  p_event_type text,
  p_provider_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_plan public.subscription_plan,
  p_status text,
  p_price_lookup_key text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.claim_stripe_event(p_event_id, p_event_type) then
    return 'duplicate';
  end if;

  insert into public.provider_subscriptions as s (
    provider_id, stripe_customer_id, stripe_subscription_id, plan, status, price_lookup_key,
    current_period_end, cancel_at_period_end, updated_at
  ) values (
    p_provider_id, p_customer_id, p_subscription_id, p_plan, p_status, p_price_lookup_key,
    p_current_period_end, p_cancel_at_period_end, now()
  )
  on conflict (provider_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    plan = excluded.plan,
    status = excluded.status,
    price_lookup_key = excluded.price_lookup_key,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = now();

  return private.finish_stripe_event(p_event_id, 'synced');
end;
$$;

-- Expiry job (every 5 minutes): marks holds whose time is up and returns their Checkout sessions
-- so the job can close them in Stripe.
create function public.expire_stale_bookings()
returns table (booking_id uuid, stripe_checkout_session_id text)
language sql security definer set search_path = ''
as $$
  update public.bookings b
  set status = 'expired'
  where b.status = 'pending_payment' and b.expires_at <= now()
  returning b.id, b.stripe_checkout_session_id;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.stripe_checkout_completed(text, text, uuid, text, text, integer, text)',
    'public.stripe_checkout_expired(text, text, uuid)',
    'public.stripe_charge_refunded(text, text, text, integer)',
    'public.stripe_sync_subscription(text, text, uuid, text, text, public.subscription_plan, text, text, timestamptz, boolean)',
    'public.expire_stale_bookings()',
    'private.claim_stripe_event(text, text)',
    'private.finish_stripe_event(text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

grant usage on schema private to service_role;
