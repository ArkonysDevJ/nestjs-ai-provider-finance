-- Privileges after the contract stage: client roles can update category_id only,
-- and classification_status is NOT NULL. Run after the expand migration and the
-- contract file have both been applied.

begin;

select plan(9);

create function pg_temp.column_privs(p_table regclass, p_column text, p_role text)
returns text[]
language sql
as $$
  select coalesce(array_agg(p order by p), array[]::text[])
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p
   where has_column_privilege(p_role, p_table::oid, p_column, p)
$$;

select ok(
  not has_table_privilege('authenticated', 'public.transactions', 'UPDATE'),
  'authenticated holds no table-wide update on transactions'
);

select is(
  pg_temp.column_privs('public.transactions', 'category_id', 'authenticated'),
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated can still update category_id'
);

select is(
  (select count(*)
     from pg_attribute a
    where a.attrelid = 'public.transactions'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname <> 'category_id'
      and pg_temp.column_privs('public.transactions', a.attname::text, 'authenticated')
          <> array['INSERT', 'SELECT']),
  0::bigint,
  'authenticated holds no update on any other column'
);

select col_not_null('public', 'transactions', 'classification_status', 'classification_status is NOT NULL');

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

insert into public.transactions
  (id, user_id, description, amount, type, category_id, ai_classified, ai_provider, classification_status)
values (
  '10000000-0000-0000-0000-000000000001', tests.get_supabase_uid('owner'),
  'Row of the owner', 10.00, 'expense',
  (select id from public.categories where name = 'Otros'), true, 'gemini', 'ai'
);

select throws_ok(
  $$ update public.transactions set amount = 99 where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table transactions',
  'the owner cannot update the amount'
);

select throws_ok(
  $$ update public.transactions set ai_classified = false where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table transactions',
  'the owner cannot update ai_classified'
);

select throws_ok(
  $$ update public.transactions set ai_provider = null where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table transactions',
  'the owner cannot update ai_provider'
);

select lives_ok(
  $$ update public.transactions
        set category_id = (select id from public.categories where name = 'Transporte')
      where id = '10000000-0000-0000-0000-000000000001' $$,
  'the owner can reclassify'
);

select is(
  (select classification_status from public.transactions where id = '10000000-0000-0000-0000-000000000001'),
  'manual',
  'and the reclassification derives the manual state'
);

select * from finish();

rollback;
