-- Guard of the classification columns, expand stage: what an insert may carry,
-- the manual state derived by a reclassification, and the rejection of direct
-- changes. The contract variant is in supabase/contract/tests.

begin;

select plan(13);

select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

-- An AI-classified row, as the API would create it once it writes the new columns.
insert into public.transactions
  (id, user_id, description, amount, type, category_id,
   ai_classified, ai_provider, classification_status, ai_model)
values (
  'e0000000-0000-0000-0000-000000000001',
  tests.get_supabase_uid('owner'),
  'AI row', 10.00, 'expense',
  (select id from public.categories where name = 'Otros'),
  true, 'gemini', 'ai', 'some-model'
);

-- ─── Reclassification derives the manual state ────────────────────────────

update public.transactions
   set category_id = (select id from public.categories where name = 'Transporte')
 where id = 'e0000000-0000-0000-0000-000000000001';

select results_eq(
  $$ select classification_status, classification_reason, ai_model, ai_classified, ai_provider
       from public.transactions where id = 'e0000000-0000-0000-0000-000000000001' $$,
  $$ values ('manual'::text, null::text, null::text, false, null::text) $$,
  'a change of category_id derives the manual state and clears the provenance'
);

-- ─── Direct changes are rejected ──────────────────────────────────────────

select throws_ok(
  $$ update public.transactions set classification_status = 'ai'
      where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'TX002', 'classification columns cannot be changed directly',
  'a direct change of classification_status is rejected'
);

select throws_ok(
  $$ update public.transactions set classification_reason = 'timeout'
      where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'TX002', 'classification columns cannot be changed directly',
  'a direct change of classification_reason is rejected'
);

select throws_ok(
  $$ update public.transactions set ai_model = 'other-model'
      where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'TX002', 'classification columns cannot be changed directly',
  'a direct change of ai_model is rejected'
);

select throws_ok(
  $$ update public.transactions
        set category_id = (select id from public.categories where name = 'Salud'),
            classification_status = 'ai'
      where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'TX002', 'classification columns cannot be changed directly',
  'a direct change together with a reclassification is rejected'
);

-- ─── Insert rules, expand stage ───────────────────────────────────────────

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros')) $$,
  'an insert with a null status and a null reason is accepted'
);

select lives_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'ai') $$,
  'an insert with an ai status is accepted'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'fallback') $$,
  '23514', null,
  'a fallback without a reason is rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status, classification_reason)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'ai', 'timeout') $$,
  '23514', null,
  'a reason without a fallback is rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_reason)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'timeout') $$,
  'TX002', 'a classification reason requires a fallback status',
  'a reason with a null status is rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'manual') $$,
  'TX002', 'classification status cannot be set to this value on insert',
  'a client cannot insert a manual status'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'legacy') $$,
  'TX002', 'classification status cannot be set to this value on insert',
  'a client cannot insert a legacy status'
);

-- Declared limit: the provenance written at creation is recorded by the API and
-- not verified by the database, so a forged but well-formed value is accepted.
select lives_ok(
  $$ insert into public.transactions
       (user_id, description, amount, type, category_id, ai_classified, ai_provider, classification_status, ai_model)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'),
             true, 'gemini', 'ai', 'forged-model') $$,
  'a forged but well-formed provenance is accepted (declared limit)'
);

select * from finish();

rollback;
