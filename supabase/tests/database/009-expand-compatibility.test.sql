-- After the expand stage the running API keeps working: an insert that does not
-- set the new columns succeeds, and the owner can still update ai_classified and
-- ai_provider, including the way the API reclassifies a row today.

begin;

select plan(6);

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

select lives_ok(
  $$ insert into public.transactions
       (id, user_id, description, amount, type, category_id, ai_classified, ai_provider)
     values ('f0000000-0000-0000-0000-000000000001', tests.get_supabase_uid('owner'),
             'Created like the running code', 12.50, 'expense',
             (select id from public.categories where name = 'Otros'), true, 'gemini') $$,
  'an insert that does not set the new columns succeeds'
);

select is(
  (select classification_status from public.transactions
    where id = 'f0000000-0000-0000-0000-000000000001'),
  null::text,
  'a row written by the running code has a null status until the contract stage'
);

select lives_ok(
  $$ update public.transactions set ai_classified = false, ai_provider = null
      where id = 'f0000000-0000-0000-0000-000000000001' $$,
  'the owner can still update ai_classified and ai_provider'
);

select lives_ok(
  $$ update public.transactions
        set category_id = (select id from public.categories where name = 'Transporte'),
            ai_classified = false,
            ai_provider = null
      where id = 'f0000000-0000-0000-0000-000000000001' $$,
  'a reclassification written the way the running code does it succeeds'
);

select is(
  (select classification_status from public.transactions
    where id = 'f0000000-0000-0000-0000-000000000001'),
  'manual',
  'and the database derives the manual state'
);

select lives_ok(
  $$ select public.get_transactions_summary() $$,
  'the summary function is callable by the owner'
);

select * from finish();

rollback;
