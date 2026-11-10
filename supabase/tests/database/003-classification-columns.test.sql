-- Covers: 003 AC-1.
-- The three classification columns exist and their checks reject invalid values.
-- The guard trigger is disabled by name inside this transaction so that the
-- table constraints are exercised on their own; the guard has its own tests.

begin;

select plan(10);

alter table public.transactions disable trigger trg_transactions_classification_guard;

select has_column('public', 'transactions', 'classification_status', 'classification_status exists');
select has_column('public', 'transactions', 'classification_reason', 'classification_reason exists');
select has_column('public', 'transactions', 'ai_model', 'ai_model exists');

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'bogus') $$,
  '23514', null,
  'a status outside ai, fallback, manual and legacy is rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status, classification_reason)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'fallback', 'bogus') $$,
  '23514', null,
  'a reason outside the four allowed values is rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status, classification_reason)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'ai', 'timeout') $$,
  '23514', null,
  'a reason on a status other than fallback is rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'fallback') $$,
  '23514', null,
  'a fallback without a reason is rejected'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status, classification_reason)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'fallback', 'timeout') $$,
  'a fallback with a reason is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status, ai_model)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'ai', 'some-model') $$,
  'an ai status with a model is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'legacy') $$,
  'a legacy status is accepted by the table constraints'
);

select * from finish();

rollback;
