-- Covers: 003 AC-4.
-- A category must apply to the transaction type, or to both. The check runs on
-- insert and on update of category_id.

begin;

select plan(9);

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

insert into public.transactions (id, user_id, description, amount, type, category_id, classification_status)
values (
  'd0000000-0000-0000-0000-000000000001',
  tests.get_supabase_uid('owner'),
  'Seed expense',
  10.00,
  'expense',
  (select id from public.categories where name = 'Vivienda'),
  'ai'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Salario'), 'ai') $$,
  'TX001', 'category does not apply to the transaction type',
  'an expense in an income-only category is rejected on insert'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'income',
             (select id from public.categories where name = 'Vivienda'), 'ai') $$,
  'TX001', 'category does not apply to the transaction type',
  'an income in an expense-only category is rejected on insert'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'income',
             (select id from public.categories where name = 'Salario'), 'ai') $$,
  'an income in an income category is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Transporte'), 'ai') $$,
  'an expense in an expense category is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'income',
             (select id from public.categories where name = 'Otros'), 'ai') $$,
  'an income in a category that applies to both is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'ai') $$,
  'an expense in a category that applies to both is accepted'
);

select throws_ok(
  $$ update public.transactions
        set category_id = (select id from public.categories where name = 'Salario')
      where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'TX001', 'category does not apply to the transaction type',
  'reclassifying an expense into an income-only category is rejected'
);

select lives_ok(
  $$ update public.transactions
        set category_id = (select id from public.categories where name = 'Transporte')
      where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'reclassifying an expense into another expense category is accepted'
);

-- The trigger also fires on a change of type, but a client no longer holds the
-- privilege to change it: the privilege check fails first.
select throws_ok(
  $$ update public.transactions set type = 'income'
      where id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table transactions',
  'a client cannot change the type of a transaction'
);

select * from finish();

rollback;
