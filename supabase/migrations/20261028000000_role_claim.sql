-- The user's role in the access token (claim "user_role"), so proxy.ts can route by role before a
-- page renders, without a database query per request (Next.js: proxy only does optimistic checks
-- from the session cookie). The claim is a routing hint, not a permission: RLS and the page guards
-- still read public.profiles. A role change reaches the claim at the next token refresh (≤ 1 hour).
--
-- Supabase Auth calls this function on every token issue once it is enabled:
-- Dashboard → Authentication → Hooks → Customize Access Token → public.custom_access_token_hook.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  select p.role into v_role from public.profiles p where p.id = (event ->> 'user_id')::uuid;
  -- A brand-new user may not have a profile row yet: the trigger default is 'client'.
  return jsonb_set(event, '{claims,user_role}', to_jsonb(coalesce(v_role, 'client')::text));
end;
$$;

-- Only the Auth service may call it; through the Data API it would let anyone read any user's role.
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- The hook runs as supabase_auth_admin: it reads the role column, nothing else.
grant select (id, role) on public.profiles to supabase_auth_admin;
create policy "Auth service reads roles"
  on public.profiles for select to supabase_auth_admin
  using (true);
