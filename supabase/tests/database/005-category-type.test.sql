-- A category must apply to the transaction type, or to both. The check runs on
-- insert and on update of category_id (and of type).

begin;

select plan(9);

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

insert into public.transactions (id, user_id, description, amount, type, category_id)
values (
  'd0000000-0000-0000-0000-000000000001',
  tests.get_supabase_uid('owner'),
  'Seed expense',
  10.00,
  'expense',
  (select id from public.categories where name = 'Vivienda')
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Salario')) $$,
  'TX001', 'category does not apply to the transaction type',
  'an expense in an income-only category is rejected on insert'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'income',
             (select id from public.categories where name = 'Vivienda')) $$,
  'TX001', 'category does not apply to the transaction type',
  'an income in an expense-only category is rejected on insert'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'income',
             (select id from public.categories where name = 'Salario')) $$,
  'an income in an income category is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Transporte')) $$,
  'an expense in an expense category is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'income',
             (select id from public.categories where name = 'Otros')) $$,
  'an income in a category that applies to both is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros')) $$,
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

select throws_ok(
  $$ update public.transactions set type = 'income'
      where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'TX001', 'category does not apply to the transaction type',
  'changing the type so that the category no longer applies is rejected'
);

select * from finish();

rollback;
