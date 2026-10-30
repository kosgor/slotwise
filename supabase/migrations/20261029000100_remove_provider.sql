-- Removing a provider from the platform: final, unlike "suspend". The row stays, anonymised —
-- bookings, payments and the audit log keep pointing at it, and the money history must stay
-- (ADR 0012, "Removing a provider").
--
-- In one transaction: future bookings are cancelled, the public profile and the name on bookings
-- are anonymised, services and the schedule switched off, reviews hidden, documents for the AI
-- deleted, the row is detached from the person's account (which goes back to the client role),
-- and the audit log records it.
-- What needs Stripe, email or Storage happens in the provider-removed background job, driven by
-- the list this function returns: refunds, closing unpaid Checkout pages, emails, cancelling the
-- Pro subscription, deleting the document files.

create function public.remove_provider(p_provider_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_provider public.providers;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_from public.provider_status;
  v_name text;
  v_user uuid;
  v_cancelled jsonb;
begin
  if not private.is_admin() then
    raise exception 'not_admin';
  end if;
  if v_reason is null then
    raise exception 'note_required';
  end if;

  select * into v_provider from public.providers where id = p_provider_id for update;
  if not found then
    raise exception 'provider_not_found';
  end if;
  if v_provider.status = 'removed' then
    raise exception 'invalid_transition';
  end if;
  v_from := v_provider.status;
  v_name := v_provider.display_name;
  v_user := v_provider.user_id;

  -- Future bookings end here; their previous status tells the job what to do with each one.
  with old as (
    select id, status from public.bookings
    where provider_id = p_provider_id
      and status in ('pending_payment', 'confirmed')
      and starts_at > now()
    for update
  ), cancelled as (
    update public.bookings b
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), expires_at = null
    from old
    where b.id = old.id
    returning b.id, old.status as was
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('bookingId', id, 'wasConfirmed', was = 'confirmed')),
    '[]'::jsonb
  ) into v_cancelled
  from cancelled;

  -- Bookings keep their dates and amounts; the name on them is the provider's personal data.
  update public.bookings set provider_name = 'Removed provider' where provider_id = p_provider_id;

  -- Detached: every owner policy (private.owns_provider) is about user_id, so the person can no
  -- longer read or edit the anonymised row, and a new application starts from scratch (pending).
  update public.providers
  set status = 'removed',
      user_id = null,
      -- Unique and valid for the slug check; the old address becomes free and 404s meanwhile.
      slug = 'removed-' || replace(id::text, '-', ''),
      display_name = 'Removed provider',
      headline = '',
      bio = '',
      city = '',
      languages = '{}',
      years_experience = 0,
      photo_url = null,
      review_note = v_reason,
      reviewed_at = now()
  where id = p_provider_id
  returning * into v_provider;

  update public.services set active = false where provider_id = p_provider_id and active;
  delete from public.availability_rules where provider_id = p_provider_id;
  delete from public.availability_exceptions where provider_id = p_provider_id;
  update public.reviews
  set hidden = true, hidden_reason = 'Provider removed', moderated_at = now()
  where provider_id = p_provider_id and not hidden;
  -- Chunks go with their documents (on delete cascade); the files themselves in the job.
  delete from public.provider_documents where provider_id = p_provider_id;

  -- Still a Slotwise account, as a client.
  update public.profiles set role = 'client' where id = v_user and role = 'provider';

  -- The log keeps the name: it is admin-only, and "who was removed and why" is its whole point.
  perform private.audit(
    'provider.remove', 'provider', p_provider_id::text,
    jsonb_build_object(
      'from', v_from, 'to', 'removed', 'note', v_reason, 'name', v_name,
      'cancelled_bookings', jsonb_array_length(v_cancelled)
    )
  );
  -- userId: the job emails the person, whom the row no longer points to.
  return jsonb_build_object('cancelled', v_cancelled, 'userId', v_user);
end;
$$;

revoke execute on function public.remove_provider(uuid, text) from public, anon;
grant execute on function public.remove_provider(uuid, text) to authenticated;
