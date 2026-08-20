-- ════════════════════════════════════════════════════════════════
-- [F-ID: SQL-005-HEALTH-PING]
-- @project     nestjs-ai-provider-finance (portfolio)
-- @description Dedicated health-check primitive for GET /v1/health
--              (Supabase keep-alive automation, see
--              .github/workflows/keep-alive.yml). SECURITY DEFINER
--              so it needs no table grants at all -- deliberately
--              decoupled from categories/transactions permissions,
--              so a future grants change can't silently break the
--              health check again (the first version of this
--              endpoint queried `categories` directly and broke
--              exactly that way -- see 002_grants.sql, which only
--              grants `authenticated`, never `anon`). The only
--              privilege this migration grants is EXECUTE on this
--              one no-op function, to `anon` -- the health endpoint
--              is called by an unattended scheduler with no JWT to
--              present.
-- @version     1.0.0
-- @changelog   1.0.0 — Initial creation.
-- ════════════════════════════════════════════════════════════════

begin;

create or replace function public.ping()
returns boolean
language sql
security definer
set search_path = public
as $$
  select true;
$$;

grant execute on function public.ping() to anon;

commit;
