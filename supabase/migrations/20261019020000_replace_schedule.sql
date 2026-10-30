-- Atomic weekly-schedule save for the provider dashboard.
-- Deleting the old rules and inserting the new ones as two API calls could leave a provider with
-- no schedule at all if the second call failed. One function = one transaction: all or nothing.
-- SECURITY INVOKER (the default): runs with the caller's rights, so the "Owners …" RLS policies on
-- availability_rules still decide what may be deleted and inserted.

create function public.replace_availability_rules(p_provider_id uuid, p_rules jsonb)
returns setof public.availability_rules
language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.owns_provider(p_provider_id) then
    raise exception 'not_owner';
  end if;

  delete from public.availability_rules where provider_id = p_provider_id;

  -- Overlapping intervals on one weekday fail the availability_rules_no_overlap constraint and
  -- roll the whole call back, old rules included.
  return query
  insert into public.availability_rules (provider_id, weekday, start_time, end_time)
  select p_provider_id, r.weekday, r.start_time, r.end_time
  from jsonb_to_recordset(p_rules) as r(weekday smallint, start_time time, end_time time)
  returning *;
end;
$$;

revoke execute on function public.replace_availability_rules(uuid, jsonb) from public;
grant execute on function public.replace_availability_rules(uuid, jsonb) to authenticated;
