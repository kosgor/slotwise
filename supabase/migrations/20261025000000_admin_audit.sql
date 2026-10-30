-- Stage 5: audit log and review moderation.
--
-- * audit_log: who did what to which record. Written only inside the database functions that make
--   the change (same transaction), so an action without its log line cannot happen. Admins read it;
--   nobody can edit or delete it through the Data API.
-- * Review moderation: admins hide (with a reason) or restore a review through moderate_review().

-- ---------------------------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  -- Null when the actor's account was deleted; the action stays.
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 3 and 60),
  entity text not null check (char_length(entity) between 2 and 40),
  entity_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

alter table public.audit_log enable row level security;

create policy "Admins read the audit log"
  on public.audit_log for select to authenticated
  using ((select private.is_admin()));

grant select on public.audit_log to authenticated;
-- No insert/update/delete for anyone through the API; service_role may insert (jobs, scripts).
grant select, insert on public.audit_log to service_role;

create function private.audit(p_action text, p_entity text, p_entity_id text, p_data jsonb default '{}')
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, data)
  values ((select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_data, '{}'::jsonb));
$$;
revoke execute on function private.audit(text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------------------------
-- Provider review, now with an audit line (same rules as 20261021000000_provider_review.sql)
-- ---------------------------------------------------------------------------------------------

create or replace function public.review_provider(
  p_provider_id uuid, p_decision text, p_note text default null
) returns public.providers
language plpgsql security definer set search_path = ''
as $$
declare
  v_provider public.providers;
  v_from public.provider_status;
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
  v_from := v_provider.status;

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

  perform private.audit(
    'provider.' || p_decision, 'provider', p_provider_id::text,
    jsonb_build_object('from', v_from, 'to', v_target, 'note', v_note, 'name', v_provider.display_name)
  );
  return v_provider;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Review moderation
-- ---------------------------------------------------------------------------------------------

alter table public.reviews
  add column hidden_reason text check (char_length(hidden_reason) <= 300),
  add column moderated_at timestamptz;

-- Admins see hidden reviews too (visitors keep seeing only visible ones of approved providers).
create policy "Admins read all reviews"
  on public.reviews for select to authenticated
  using ((select private.is_admin()));

-- Hide (reason required) or restore a review. Errors: not_admin, review_not_found, note_required.
create function public.moderate_review(p_review_id uuid, p_hidden boolean, p_reason text default null)
returns public.reviews
language plpgsql security definer set search_path = ''
as $$
declare
  v_review public.reviews;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_hidden and v_reason is null then
    raise exception 'note_required';
  end if;

  update public.reviews
  set hidden = p_hidden,
      hidden_reason = case when p_hidden then v_reason else null end,
      moderated_at = now()
  where id = p_review_id
  returning * into v_review;
  if not found then
    raise exception 'review_not_found';
  end if;

  perform private.audit(
    case when p_hidden then 'review.hide' else 'review.restore' end,
    'review', p_review_id::text,
    jsonb_build_object('provider_id', v_review.provider_id, 'reason', v_reason)
  );
  return v_review;
end;
$$;
revoke execute on function public.moderate_review(uuid, boolean, text) from public, anon;
grant execute on function public.moderate_review(uuid, boolean, text) to authenticated;
