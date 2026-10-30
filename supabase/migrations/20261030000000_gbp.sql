-- Slotwise is a UK service: prices are in pounds sterling.
--
-- A new service gets GBP; services priced in dollars before the switch are moved to GBP with the
-- same number (a £45 lesson, not a currency conversion: the amounts were demo values). Bookings keep
-- the currency they were made in: they are a record of what the client paid.
alter table public.services alter column currency set default 'GBP';

update public.services set currency = 'GBP' where currency = 'USD';
