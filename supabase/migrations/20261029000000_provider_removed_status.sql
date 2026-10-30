-- A provider removed from the platform for good (remove_provider() in the next migration).
-- Its own file: a new enum value cannot be used in the transaction that adds it.

alter type public.provider_status add value if not exists 'removed';
