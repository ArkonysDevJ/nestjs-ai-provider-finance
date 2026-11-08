-- A zero or negative amount is rejected with 23514.

begin;

select plan(3);

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 0, 'expense',
             (select id from public.categories where name = 'Otros')) $$,
  '23514', null,
  'a zero amount is rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', -1.00, 'expense',
             (select id from public.categories where name = 'Otros')) $$,
  '23514', null,
  'a negative amount is rejected'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 0.01, 'expense',
             (select id from public.categories where name = 'Otros')) $$,
  'the smallest positive amount is accepted'
);

select * from finish();

rollback;
