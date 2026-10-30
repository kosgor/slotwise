-- Performance fixes from `supabase db advisors` after stage 2. Access rules do not change
-- (tests/rls pass unchanged).
--
-- Lint 0006 multiple_permissive_policies: Postgres evaluates every permissive policy for a role
-- and action separately and ORs the results. One policy per (role, action) with the conditions
-- ORed inside is cheaper and easier to read.
-- Lint 0001 unindexed_foreign_keys: index foreign keys used in joins and cascades.

-- providers ------------------------------------------------------------------------------------
drop policy "Approved providers are public" on public.providers;
drop policy "Owners read their own provider profile" on public.providers;

create policy "Visitors read approved providers"
  on public.providers for select to anon
  using (status = 'approved');

create policy "Users read approved providers, their own, or all as admin"
  on public.providers for select to authenticated
  using (status = 'approved' or user_id = (select auth.uid()) or (select private.is_admin()));

-- services -------------------------------------------------------------------------------------
drop policy "Active services of approved providers are public" on public.services;
drop policy "Owners read all their services" on public.services;

create policy "Visitors read active services of approved providers"
  on public.services for select to anon
  using (
    active
    and exists (select 1 from public.providers p where p.id = provider_id and p.status = 'approved')
  );

create policy "Users read public services, their own, or all as admin"
  on public.services for select to authenticated
  using (
    (active and exists (select 1 from public.providers p where p.id = provider_id and p.status = 'approved'))
    or private.owns_provider(provider_id)
    or (select private.is_admin())
  );

-- availability_rules ---------------------------------------------------------------------------
drop policy "Schedules of approved providers are public" on public.availability_rules;
drop policy "Owners manage their schedule" on public.availability_rules;

create policy "Visitors read schedules of approved providers"
  on public.availability_rules for select to anon
  using (exists (select 1 from public.providers p where p.id = provider_id and p.status = 'approved'));

create policy "Users read public schedules or their own"
  on public.availability_rules for select to authenticated
  using (
    exists (select 1 from public.providers p where p.id = provider_id and p.status = 'approved')
    or private.owns_provider(provider_id)
  );

create policy "Owners add schedule rules"
  on public.availability_rules for insert to authenticated
  with check (private.owns_provider(provider_id));

create policy "Owners change schedule rules"
  on public.availability_rules for update to authenticated
  using (private.owns_provider(provider_id))
  with check (private.owns_provider(provider_id));

create policy "Owners remove schedule rules"
  on public.availability_rules for delete to authenticated
  using (private.owns_provider(provider_id));

-- availability_exceptions ----------------------------------------------------------------------
drop policy "Exceptions of approved providers are public" on public.availability_exceptions;
drop policy "Owners manage their exceptions" on public.availability_exceptions;

create policy "Visitors read exceptions of approved providers"
  on public.availability_exceptions for select to anon
  using (exists (select 1 from public.providers p where p.id = provider_id and p.status = 'approved'));

create policy "Users read public exceptions or their own"
  on public.availability_exceptions for select to authenticated
  using (
    exists (select 1 from public.providers p where p.id = provider_id and p.status = 'approved')
    or private.owns_provider(provider_id)
  );

create policy "Owners add exceptions"
  on public.availability_exceptions for insert to authenticated
  with check (private.owns_provider(provider_id));

create policy "Owners change exceptions"
  on public.availability_exceptions for update to authenticated
  using (private.owns_provider(provider_id))
  with check (private.owns_provider(provider_id));

create policy "Owners remove exceptions"
  on public.availability_exceptions for delete to authenticated
  using (private.owns_provider(provider_id));

-- bookings -------------------------------------------------------------------------------------
drop policy "Clients read their bookings" on public.bookings;
drop policy "Providers read bookings with them" on public.bookings;
drop policy "Admins read all bookings" on public.bookings;

create policy "Clients, their providers and admins read bookings"
  on public.bookings for select to authenticated
  using (
    client_id = (select auth.uid())
    or private.owns_provider(provider_id)
    or (select private.is_admin())
  );

-- Foreign key indexes ---------------------------------------------------------------------------
create index bookings_service_idx on public.bookings (service_id);
create index bookings_cancelled_by_idx on public.bookings (cancelled_by);
