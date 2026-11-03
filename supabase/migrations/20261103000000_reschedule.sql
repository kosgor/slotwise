-- Moving a booking to another time (docs/decisions/0014-reschedule.md).
--
-- * The same booking row moves: its id, price, payment and refund history stay as they are.
-- * The new time follows the same rules as a new booking. They now live in one function,
--   private.slot_fits_schedule(), used by both book_slot() and reschedule_booking().
--   lib/booking/rules.ts and lib/booking/slots.ts mirror them; tests/rls checks they agree.

alter table public.bookings
  add column rescheduled_at timestamptz,
  add column rescheduled_by uuid references auth.users (id);
create index bookings_rescheduled_by_idx on public.bookings (rescheduled_by);

-- Whether [p_starts_at, p_ends_at) is a bookable time of this provider: notice and advance limits,
-- inside one working-hours rule of that local weekday on the 30-minute grid, and not inside a day
-- off or a blocked interval. Busy times are not checked here: bookings_no_overlap does that.
-- lib/booking/rules.ts: MIN_NOTICE_MINUTES = 60, MAX_ADVANCE_DAYS = 60, SLOT_STEP_MINUTES = 30.
create function private.slot_fits_schedule(
  p_provider_id uuid, p_timezone text, p_starts_at timestamptz, p_ends_at timestamptz
) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_local timestamp := p_starts_at at time zone p_timezone;
  v_local_end timestamp := p_ends_at at time zone p_timezone;
begin
  if p_starts_at < now() + interval '60 minutes' or p_starts_at > now() + interval '60 days' then
    return false;
  end if;

  if not exists (
    select 1 from public.availability_rules r
    where r.provider_id = p_provider_id
      and r.weekday = extract(isodow from v_local)
      and v_local_end::date = v_local::date
      and v_local::time >= r.start_time
      and v_local_end::time <= r.end_time
      and extract(epoch from (v_local::time - r.start_time))::int % (30 * 60) = 0
  ) then
    return false;
  end if;

  return not exists (
    select 1 from public.availability_exceptions e
    where e.provider_id = p_provider_id
      and e.date = v_local::date
      and (e.start_time is null or (v_local::time < e.end_time and v_local_end::time > e.start_time))
  );
end;
$$;
revoke execute on function private.slot_fits_schedule(uuid, text, timestamptz, timestamptz) from public;

-- Unchanged behaviour (20261020000000_payments.sql); the schedule check moved into
-- private.slot_fits_schedule(). Errors: not_authenticated, service_not_found, own_service,
-- slot_unavailable, slot_taken, too_many_holds.
create or replace function public.book_slot(p_service_id uuid, p_starts_at timestamptz)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_service public.services;
  v_provider public.providers;
  v_ends timestamptz;
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

  v_ends := p_starts_at + make_interval(mins => v_service.duration_min);
  if not private.slot_fits_schedule(v_provider.id, v_provider.timezone, p_starts_at, v_ends) then
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

-- Moves a confirmed upcoming booking to another free time of the same provider. The client may do
-- it while the start is at least 24 hours away, the same window as free cancellation
-- (lib/booking/rules.ts: CLIENT_RESCHEDULE_HOURS), so it never opens a way around that rule. The
-- provider may move any upcoming booking, but only into their own working hours.
-- The length comes from the booking, so it works even after the service was switched off.
-- Errors: not_authenticated, booking_not_found, not_reschedulable, too_late_to_reschedule,
-- same_time, slot_unavailable, slot_taken.
create function public.reschedule_booking(p_booking_id uuid, p_starts_at timestamptz)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_booking public.bookings;
  v_provider public.providers;
  v_is_client boolean;
  v_is_provider boolean;
  v_ends timestamptz;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  select * into v_provider from public.providers where id = v_booking.provider_id;

  v_is_client := v_booking.client_id = v_user;
  v_is_provider := v_provider.user_id = v_user;
  -- Same answer for "does not exist" and "not yours": no hint that the booking exists.
  if not (v_is_client or v_is_provider) then
    raise exception 'booking_not_found';
  end if;

  -- Only confirmed bookings: a hold waiting for payment is released and booked again instead.
  -- A provider who is not public (suspended) has no free times to offer.
  if v_booking.status <> 'confirmed' or v_booking.starts_at <= now()
     or v_provider.status <> 'approved' then
    raise exception 'not_reschedulable';
  end if;
  if v_is_client and not v_is_provider
     and v_booking.starts_at < now() + interval '24 hours' then
    raise exception 'too_late_to_reschedule';
  end if;
  if p_starts_at = v_booking.starts_at then
    raise exception 'same_time';
  end if;

  v_ends := p_starts_at + make_interval(mins => v_booking.duration_min);
  if not private.slot_fits_schedule(v_provider.id, v_provider.timezone, p_starts_at, v_ends) then
    raise exception 'slot_unavailable';
  end if;

  -- Same as book_slot(): stale holds in the way no longer count.
  update public.bookings
  set status = 'expired'
  where provider_id = v_provider.id
    and status = 'pending_payment'
    and expires_at <= now()
    and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, v_ends, '[)');

  begin
    -- The exclusion constraint compares with the other bookings only, so moving by half an hour
    -- over the booking's own old time is fine.
    update public.bookings
    set starts_at = p_starts_at, ends_at = v_ends, rescheduled_at = now(), rescheduled_by = v_user
    where id = p_booking_id
    returning * into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return v_booking;
end;
$$;
revoke execute on function public.reschedule_booking(uuid, timestamptz) from public;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;
