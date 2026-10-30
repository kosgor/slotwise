-- Fixes for warnings from `supabase db advisors --linked` (Supabase database linter).

-- Lint 0011 function_search_path_mutable.
-- A function without a fixed search_path resolves names (e.g. now()) using the caller's
-- search_path, so a role able to create objects earlier in that path could substitute its own.
-- An empty search_path leaves only pg_catalog, where now() lives.
alter function public.set_updated_at() set search_path = '';

-- Lints 0028/0029 anon/authenticated_security_definer_function_executable.
-- rls_auto_enable() is created by Supabase when "Enable automatic RLS" is turned on. It is
-- SECURITY DEFINER and lives in the exposed public schema, so the Data API lists it as
-- /rest/v1/rpc/rls_auto_enable for anon and authenticated. It is an event-trigger function and
-- cannot actually be called that way (checked: Postgres rejects it), but visitors should not
-- hold privileges they never need. The event trigger itself runs on DDL by the database owner
-- and is not affected.
-- Conditional: the function exists only on the hosted project, not in local Supabase or PGlite tests.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
