-- supabase/tests/database/001-user-isolation.test.sql
-- [F-ID: SQL-TEST-USER-ISOLATION-01]
-- @project nestjs-ai-provider-finance (portfolio)
-- @version 1.0.0
-- @changelog 1.0.0 — Proves the RLS invariants in
--   20260728120000_001_init_schema.sql directly against Postgres,
--   independent of the NestJS layer and independent of the bruno
--   HTTP-level tests (03-direct-rls-cross-user-empty /
--   04-direct-rls-own-user-visible), which exercise the same
--   boundary from outside the system rather than at the database
--   level. Pattern replicated from nestjs-rls-multitenant-bookings'
--   001-tenant-isolation.test.sql — same helpers, same structure,
--   no reinvention. Run via `supabase test db` — requires
--   000-setup-tests-hooks.sql to have installed pgTAP + basejump
--   test helpers first.
--
--   Deliberately NOT covered here (see audit payload, "fuera de
--   alcance"): FORCE ROW LEVEL SECURITY (20260805000000_004_force_
--   rls.sql) protects against the table-owner bypass specifically.
--   pgTAP authenticates as end-user roles via tests.authenticate_as,
--   never as the table owner, so this suite doesn't exercise that
--   path by construction -- a FORCE RLS regression would need a
--   different kind of test (e.g. a manual psql session connected as
--   the table owner), which is out of scope for this file.

begin;

select plan(5);

-- ─── Setup (as service_role, bypasses RLS) ──────────────────────────────

select tests.create_supabase_user('user_a');
select tests.create_supabase_user('user_b');

select tests.authenticate_as_service_role();

-- One category id is enough for both users' rows; RLS on categories is
-- select-only/public, not under test here except as a control (test 5).
insert into transactions (id, user_id, description, amount, type, category_id)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    tests.get_supabase_uid('user_a'),
    'User A groceries',
    50.00,
    'expense',
    (select id from categories where name = 'Otros')
  ),
  (
    'b0000000-0000-0000-0000-000000000001',
    tests.get_supabase_uid('user_b'),
    'User B rent',
    800.00,
    'expense',
    (select id from categories where name = 'Otros')
  );

-- ─── transactions_select_own: cross-user reads are denied ──────────────

select tests.authenticate_as('user_b');

select results_eq(
  $$ select count(*) from transactions $$,
  ARRAY[1::bigint],
  'user_b sees exactly their own transaction, not user_a''s'
);

-- ─── transactions_insert_own: cannot spoof another user's authorship ───

select tests.authenticate_as('user_a');

select throws_ok(
  $$
    insert into transactions (user_id, description, amount, type, category_id)
    values (
      (select tests.get_supabase_uid('user_b')),
      'Spoofed transaction',
      10.00,
      'expense',
      (select id from categories where name = 'Otros')
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "transactions"',
  'user_a cannot insert a transaction attributed to user_b (RLS denies the insert)'
);

-- ─── transactions_update_own: cannot touch another user's row ──────────

select results_eq(
  $$
    update transactions set amount = 999.99
    where id = 'b0000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  ARRAY[]::integer[],
  'user_a cannot update user_b''s transaction (0 rows affected, not an error)'
);

-- ─── transactions_delete_own: cannot delete another user's row ─────────

select results_eq(
  $$
    delete from transactions
    where id = 'b0000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  ARRAY[]::integer[],
  'user_a cannot delete user_b''s transaction (0 rows affected, not an error)'
);

-- ─── categories_select_authenticated: public read is intact (control) ──
-- Companion to the tests above: proves this isn't "everything denied"
-- but genuine per-row isolation on transactions specifically. Same role
-- test 04 plays on the bruno side.

select isnt_empty(
  $$ select * from categories $$,
  'any authenticated user can read the shared category catalog'
);

select * from finish();

rollback;
