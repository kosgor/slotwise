-- Provider review: admins approve or reject applications and can suspend or reinstate profiles.
--
-- Status changes go through one function, like bookings: the provider row has no UPDATE grant on
-- `status`, so even a provider calling the REST API directly cannot approve themselves.

alter table public.providers
  -- Shown to the provider on rejection or suspension: what to fix.
  add column review_note text check (char_length(review_note) <= 500),
  add column reviewed_at timestamptz;
-- No reviewed_by here: providers is readable by everyone (approved rows), so an admin id would be
-- public. Who reviewed what belongs in the admin-only audit log (stage 5).
create index providers_status_created_idx on public.providers (status, created_at);

-- Allowed transitions (anything else → invalid_transition):
--   approve:  pending, rejected, suspended → approved
--   reject:   pending → rejected     (note required)
--   suspend:  approved → suspended   (note required)
-- Errors: not_admin, provider_not_found, invalid_transition, note_required.
create function public.review_provider(
  p_provider_id uuid, p_decision text, p_note text default null
) returns public.providers
language plpgsql security definer set search_path = ''
as $$
declare
  v_provider public.providers;
  v_target public.provider_status;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not private.is_admin() then
    raise exception 'not_admin';
  end if;

  select * into v_provider from public.providers where id = p_provider_id for update;
  if not found then
    raise exception 'provider_not_found';
  end if;

  v_target := case
    when p_decision = 'approve' and v_provider.status in ('pending', 'rejected', 'suspended') then 'approved'
    when p_decision = 'reject' and v_provider.status = 'pending' then 'rejected'
    when p_decision = 'suspend' and v_provider.status = 'approved' then 'suspended'
  end::public.provider_status;
  if v_target is null then
    raise exception 'invalid_transition';
  end if;
  if v_target in ('rejected', 'suspended') and v_note is null then
    raise exception 'note_required';
  end if;

  update public.providers
  set status = v_target,
      review_note = case when v_target = 'approved' then null else v_note end,
      reviewed_at = now()
  where id = p_provider_id
  returning * into v_provider;
  return v_provider;
end;
$$;
revoke execute on function public.review_provider(uuid, text, text) from public, anon;
grant execute on function public.review_provider(uuid, text, text) to authenticated;
