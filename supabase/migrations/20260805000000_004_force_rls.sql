-- ════════════════════════════════════════════════════════════════
-- [F-ID: SQL-004-FORCE-RLS]
-- @project     nestjs-ai-provider-finance (portfolio)
-- @description Adds FORCE ROW LEVEL SECURITY to categories and
--              transactions. ENABLE alone (001_init_schema.sql)
--              leaves the classic table-owner bypass open: if a
--              connection ever authenticates as the table owner,
--              RLS policies are skipped entirely regardless of
--              ENABLE. FORCE closes that gap -- policies apply
--              even to the owner, with the sole exception of a
--              role holding BYPASSRLS. Same standard already
--              closed on nestjs-rls-multitenant-bookings; applied
--              here as consistent policy, not a new pattern.
-- @version     1.0.0
-- @changelog   1.0.0 — Initial creation.
-- ════════════════════════════════════════════════════════════════

begin;

alter table public.categories force row level security;
alter table public.transactions force row level security;

commit;
