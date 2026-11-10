-- The summary function: invoker, stable, empty search_path, executable by
-- authenticated only, isolated per user, and exact to the cent.

begin;

select plan(8);

select ok(
  (select not prosecdef and provolatile = 's' and proconfig @> array['search_path=""']
     from pg_proc where oid = 'public.get_transactions_summary(text)'::regprocedure),
  'the summary function is invoker, stable and has an empty search_path'
);

select tests.create_supabase_user('owner');
select tests.create_supabase_user('other');

-- 1200 small expenses: float arithmetic would not give an exact total.
select tests.authenticate_as('owner');

insert into public.transactions (user_id, description, amount, type, category_id, occurred_at, classification_status)
select tests.get_supabase_uid('owner'), 'small', 0.10, 'expense',
       (select id from public.categories where name = 'Alimentación'), date '2026-03-15', 'ai'
  from generate_series(1, 1200);

insert into public.transactions (user_id, description, amount, type, category_id, occurred_at, classification_status)
values
  (tests.get_supabase_uid('owner'), 'salary', 1000.50, 'income',
   (select id from public.categories where name = 'Salario'), date '2026-03-20', 'ai'),
  (tests.get_supabase_uid('owner'), 'bus', 5.25, 'expense',
   (select id from public.categories where name = 'Transporte'), date '2026-02-10', 'ai');

select tests.authenticate_as('other');

insert into public.transactions (user_id, description, amount, type, category_id, occurred_at, classification_status)
values (tests.get_supabase_uid('other'), 'rent', 999.99, 'expense',
        (select id from public.categories where name = 'Vivienda'), date '2026-03-05', 'ai');

-- ─── Owner: exact totals, own rows only ───────────────────────────────────

select tests.authenticate_as('owner');

select is(
  public.get_transactions_summary('2026-03'),
  jsonb_build_object(
    'selectedMonth', '2026-03',
    'byCategory', jsonb_build_array(
      jsonb_build_object(
        'categoryId', (select id from public.categories where name = 'Alimentación'),
        'categoryName', 'Alimentación',
        'totalExpense', '120.00', 'totalIncome', '0.00', 'transactionCount', 1200),
      jsonb_build_object(
        'categoryId', (select id from public.categories where name = 'Salario'),
        'categoryName', 'Salario',
        'totalExpense', '0.00', 'totalIncome', '1000.50', 'transactionCount', 1)),
    'byMonth', jsonb_build_array(
      jsonb_build_object(
        'month', '2026-02', 'totalExpense', '5.25', 'totalIncome', '0.00', 'transactionCount', 1),
      jsonb_build_object(
        'month', '2026-03', 'totalExpense', '120.00', 'totalIncome', '1000.50', 'transactionCount', 1201))),
  'the summary is exact for more than 1000 rows and ignores the other user'
);

select is(
  public.get_transactions_summary('2025-01') -> 'byCategory',
  '[]'::jsonb,
  'a month without rows has an empty byCategory'
);

select is(
  public.get_transactions_summary() ->> 'selectedMonth',
  to_char(current_date, 'YYYY-MM'),
  'without a month the current month is used'
);

select throws_ok(
  $$ select public.get_transactions_summary('2026-13') $$,
  '22023', 'invalid month, expected YYYY-MM',
  'an invalid month is rejected'
);

-- ─── The other user sees only their own rows ──────────────────────────────

select tests.authenticate_as('other');

select is(
  public.get_transactions_summary('2026-03') -> 'byMonth' -> 0 ->> 'totalExpense',
  '999.99',
  'the other user gets their own total, not the owner''s'
);

-- ─── Only authenticated can execute it ────────────────────────────────────
-- Checked in the catalog. Switching to anon with raw role statements inside the
-- test crashed the database server of the local stack image, so the test does
-- not switch roles that way.

select ok(
  not has_function_privilege('anon', 'public.get_transactions_summary(text)', 'EXECUTE'),
  'anon cannot execute the summary function'
);

select ok(
  not exists (
    select 1
      from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'public.get_transactions_summary(text)'::regprocedure
       and a.grantee = 0
  ),
  'PUBLIC cannot execute the summary function'
);

select * from finish();

rollback;
