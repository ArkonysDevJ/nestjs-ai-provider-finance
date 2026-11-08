-- Privilege catalog after the expand stage: schema, tables, columns, functions
-- and default privileges, for anon, authenticated, service_role and PUBLIC.
-- The contract variant (update on category_id only) is in supabase/contract/tests.

begin;

select plan(23);

-- ─── Helpers (session-local) ───────────────────────────────────────────────

create function pg_temp.table_privs(p_table regclass, p_role text)
returns text[]
language sql
as $$
  select coalesce(array_agg(distinct a.privilege_type order by a.privilege_type), array[]::text[])
    from pg_class c
   cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   where c.oid = p_table
     and a.grantee = case when p_role = 'public' then 0
                          else (select oid from pg_roles where rolname = p_role) end
$$;

create function pg_temp.column_privs(p_table regclass, p_column text, p_role text)
returns text[]
language sql
as $$
  select coalesce(array_agg(p order by p), array[]::text[])
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p
   where has_column_privilege(p_role, p_table::oid, p_column, p)
$$;

create function pg_temp.function_privs(p_function text, p_role text)
returns text[]
language sql
as $$
  select coalesce(array_agg(distinct a.privilege_type order by a.privilege_type), array[]::text[])
    from pg_proc p
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = to_regprocedure(p_function)
     and a.grantee = case when p_role = 'public' then 0
                          else (select oid from pg_roles where rolname = p_role) end
$$;

-- ─── Schema ────────────────────────────────────────────────────────────────

select ok(
  has_schema_privilege('anon', 'public', 'USAGE')
  and has_schema_privilege('authenticated', 'public', 'USAGE'),
  'anon and authenticated can use schema public'
);

select ok(
  not exists (
    select 1
      from pg_namespace n
     cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
     where n.nspname = 'public' and a.grantee = 0
  ),
  'PUBLIC has no privilege on schema public'
);

-- ─── Tables ────────────────────────────────────────────────────────────────

select is(pg_temp.table_privs('public.categories', 'anon'), array[]::text[], 'anon has no privilege on categories');
select is(pg_temp.table_privs('public.categories', 'authenticated'), array['SELECT'], 'authenticated can only select categories');
select is(pg_temp.table_privs('public.categories', 'public'), array[]::text[], 'PUBLIC has no privilege on categories');
select is(pg_temp.table_privs('public.categories', 'service_role'), array[]::text[], 'service_role has no privilege on categories');

select is(pg_temp.table_privs('public.transactions', 'anon'), array[]::text[], 'anon has no privilege on transactions');
select is(
  pg_temp.table_privs('public.transactions', 'authenticated'),
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated can select, insert and update transactions (expand stage)'
);
select is(pg_temp.table_privs('public.transactions', 'public'), array[]::text[], 'PUBLIC has no privilege on transactions');
select is(pg_temp.table_privs('public.transactions', 'service_role'), array[]::text[], 'service_role has no privilege on transactions');

-- MAINTAIN exists from Postgres 17; the catalog helper above lists it when set,
-- and this check names it explicitly.
select ok(
  case when current_setting('server_version_num')::int >= 170000 then
    not (has_table_privilege('anon', 'public.transactions', 'MAINTAIN')
         or has_table_privilege('authenticated', 'public.transactions', 'MAINTAIN')
         or has_table_privilege('service_role', 'public.transactions', 'MAINTAIN')
         or has_table_privilege('authenticated', 'public.categories', 'MAINTAIN'))
  else true end,
  'no client role holds maintain on the tables'
);

-- ─── Columns ───────────────────────────────────────────────────────────────

select is(
  (select count(*)
     from pg_attribute a
    where a.attrelid = 'public.transactions'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and pg_temp.column_privs('public.transactions', a.attname::text, 'authenticated')
          <> array['INSERT', 'SELECT', 'UPDATE']),
  0::bigint,
  'authenticated holds select, insert and update on every column of transactions (expand stage)'
);

select is(
  (select count(*)
     from pg_attribute a
    where a.attrelid in ('public.transactions'::regclass, 'public.categories'::regclass)
      and a.attnum > 0
      and not a.attisdropped
      and pg_temp.column_privs(a.attrelid::regclass, a.attname::text, 'anon') <> array[]::text[]),
  0::bigint,
  'anon holds no column privilege on either table'
);

-- ─── Functions ─────────────────────────────────────────────────────────────

select is(pg_temp.function_privs('public.ping()', 'anon'), array['EXECUTE'], 'anon can execute ping()');
select is(pg_temp.function_privs('public.ping()', 'authenticated'), array[]::text[], 'authenticated cannot execute ping()');
select is(pg_temp.function_privs('public.ping()', 'public'), array[]::text[], 'PUBLIC cannot execute ping()');

-- The only functions in public that a client role (or PUBLIC) can execute.
select results_eq(
  $$
    select p.proname::text collate "default"
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and exists (
         select 1
           from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee in (0,
                              (select oid from pg_roles where rolname = 'anon'),
                              (select oid from pg_roles where rolname = 'authenticated'),
                              (select oid from pg_roles where rolname = 'service_role'))
            and a.privilege_type = 'EXECUTE')
     order by 1
  $$,
  $$ values ('get_transactions_summary'), ('ping') $$,
  'only ping() and get_transactions_summary() are executable by a client role or PUBLIC'
);

select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.ping()'::regprocedure),
  'ping() has a fixed, empty search_path'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.set_updated_at()'::regprocedure),
  'set_updated_at() has a fixed, empty search_path'
);

select case
  when to_regprocedure('public.rls_auto_enable()') is null
    then skip('rls_auto_enable() is created by the hosted platform only', 1)
  else ok(
    pg_temp.function_privs('public.rls_auto_enable()', 'public') = array[]::text[]
    and pg_temp.function_privs('public.rls_auto_enable()', 'anon') = array[]::text[]
    and pg_temp.function_privs('public.rls_auto_enable()', 'authenticated') = array[]::text[],
    'rls_auto_enable() is not executable by PUBLIC, anon or authenticated')
end;

-- ─── Default privileges ────────────────────────────────────────────────────
-- Objects created by this role in public start with no privilege for the client
-- roles and PUBLIC. Objects created by supabase_admin are outside this guarantee.

create table public.acl_probe_table (id int);
create function public.acl_probe_function() returns int language sql as 'select 1';

select is(
  (select count(*)
     from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid = 'public.acl_probe_table'::regclass
      and a.grantee in (0,
                        (select oid from pg_roles where rolname = 'anon'),
                        (select oid from pg_roles where rolname = 'authenticated'),
                        (select oid from pg_roles where rolname = 'service_role'))),
  0::bigint,
  'a new table in public starts with no privilege for anon, authenticated, service_role and PUBLIC'
);

select is(
  (select count(*)
     from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.acl_probe_function()'::regprocedure
      and a.grantee in (0,
                        (select oid from pg_roles where rolname = 'anon'),
                        (select oid from pg_roles where rolname = 'authenticated'),
                        (select oid from pg_roles where rolname = 'service_role'))),
  0::bigint,
  'a new function in public starts with no privilege for anon, authenticated, service_role and PUBLIC'
);

-- ─── Delete is not possible for the owner of a row ────────────────────────

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

insert into public.transactions (id, user_id, description, amount, type, category_id)
values (
  'c0000000-0000-0000-0000-000000000001',
  tests.get_supabase_uid('owner'),
  'Row of the owner',
  10.00,
  'expense',
  (select id from public.categories where name = 'Otros')
);

select throws_ok(
  $$ delete from public.transactions where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table transactions',
  'the owner of a row cannot delete it'
);

select * from finish();

rollback;
