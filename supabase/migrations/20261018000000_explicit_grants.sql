-- Explicit Data API access.
-- The Supabase project is created with "Automatically expose new tables" turned off, so the
-- anon/authenticated roles cannot reach any table until it is granted here. Two layers:
--   1. GRANT decides which tables a role may touch at all (and with which operations);
--   2. RLS policies decide which rows inside those tables.
-- Every future migration that adds a table must add its grants explicitly, next to its RLS policies.

grant usage on schema public to anon, authenticated;

-- Public catalog: read-only. No insert/update/delete grants — writes go through the server.
grant select on public.providers to anon, authenticated;
grant select on public.services to anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant select on public.catalog_providers to anon, authenticated;
