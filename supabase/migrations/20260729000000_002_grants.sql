-- ════════════════════════════════════════════════════════════════
-- [F-ID: SQL-002-GRANTS]
-- @project     nestjs-ai-provider-finance (portfolio)
-- @description Table-level GRANTs for the anon/authenticated roles.
--              RLS (001_init_schema.sql) controls which rows each
--              role sees; this controls whether the role can even
--              attempt the operation on the table. Two independent
--              layers -- this one was missing. Without this GRANT,
--              every query returns "permission denied" (42501)
--              before RLS ever gets to evaluate a single row.
-- @version     1.0.0
-- @changelog   1.0.0 — Fixes "permission denied for table
--              categories", found while testing GET /categories
--              against real Supabase via Bruno.

begin;

grant usage on schema public to authenticated;

-- categories: closed catalog, read-only for authenticated users
-- (no category CRUD in v1, see brief).
grant select on public.categories to authenticated;

-- transactions: full CRUD for the row's owner; RLS already
-- restricts which row, this GRANT only enables the verb.
grant select, insert, update, delete on public.transactions to authenticated;

commit;
