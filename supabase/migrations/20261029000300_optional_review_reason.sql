-- Hiding a review no longer needs a reason (as with suspending and removing a provider). When one
-- is given it is kept on the review and in the audit log. Same signature: grants stay as they were.
create or replace function public.moderate_review(p_review_id uuid, p_hidden boolean, p_reason text default null)
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
