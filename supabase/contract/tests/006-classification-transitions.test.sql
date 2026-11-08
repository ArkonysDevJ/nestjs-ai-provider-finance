-- Insert rules after the contract stage: the status must be ai or fallback.
-- The other rules of the expand stage stay. Run after the contract file.

begin;

select plan(7);

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros')) $$,
  'TX002', 'classification status must be ai or fallback on insert',
  'an insert with a null status is rejected'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'ai') $$,
  'an insert with an ai status is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status, classification_reason)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'fallback', 'quota_exceeded') $$,
  'an insert with a fallback and a reason is accepted'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'fallback') $$,
  '23514', null,
  'a fallback without a reason is still rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'manual') $$,
  'TX002', 'classification status must be ai or fallback on insert',
  'a client still cannot insert a manual status'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'income',
             (select id from public.categories where name = 'Vivienda'), 'ai') $$,
  'TX001', 'category does not apply to the transaction type',
  'the category and type rule still applies'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 0, 'expense',
             (select id from public.categories where name = 'Otros'), 'ai') $$,
  '23514', null,
  'the amount rule still applies'
);

select * from finish();

rollback;
