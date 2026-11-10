-- Covers: 003 AC-5, 003 AC-6, 003 AC-11.
-- Guard of the classification columns: what an insert may carry (the status must
-- be ai or fallback), the manual state derived by a reclassification, and the
-- rejection of direct changes.

begin;

select plan(15);

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
-- A client no longer holds the privilege to update these columns, so the
-- privilege check fails first. The guard trigger (TX002) is a second barrier for
-- a role that does hold the privilege.

select throws_ok(
  $$ update public.transactions set classification_status = 'ai'
      where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table transactions',
  'a direct change of classification_status is rejected'
);

select throws_ok(
  $$ update public.transactions set classification_reason = 'timeout'
      where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table transactions',
  'a direct change of classification_reason is rejected'
);

select throws_ok(
  $$ update public.transactions set ai_model = 'other-model'
      where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table transactions',
  'a direct change of ai_model is rejected'
);

select throws_ok(
  $$ update public.transactions
        set category_id = (select id from public.categories where name = 'Salud'),
            classification_status = 'ai'
      where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table transactions',
  'a direct change together with a reclassification is rejected'
);

-- A request that names the category the row already has changes nothing: the
-- manual state is derived only when the category really changes.
insert into public.transactions
  (id, user_id, description, amount, type, category_id,
   ai_classified, ai_provider, classification_status, ai_model)
values (
  'e0000000-0000-0000-0000-000000000002',
  tests.get_supabase_uid('owner'),
  'Second AI row', 10.00, 'expense',
  (select id from public.categories where name = 'Otros'),
  true, 'gemini', 'ai', 'some-model'
);

update public.transactions
   set category_id = (select id from public.categories where name = 'Otros')
 where id = 'e0000000-0000-0000-0000-000000000002';

select results_eq(
  $$ select classification_status, ai_model, ai_classified, ai_provider
       from public.transactions where id = 'e0000000-0000-0000-0000-000000000002' $$,
  $$ values ('ai'::text, 'some-model'::text, true, 'gemini'::text) $$,
  'reclassifying to the category the row already has leaves the classification as it was'
);

-- ─── Insert rules ─────────────────────────────────────────────────────────

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
  'TX002', 'classification status must be ai or fallback on insert',
  'a reason with a null status is rejected'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'manual') $$,
  'TX002', 'classification status must be ai or fallback on insert',
  'a client cannot insert a manual status'
);

select throws_ok(
  $$ insert into public.transactions (user_id, description, amount, type, category_id, classification_status)
     values (tests.get_supabase_uid('owner'), 'x', 1, 'expense',
             (select id from public.categories where name = 'Otros'), 'legacy') $$,
  'TX002', 'classification status must be ai or fallback on insert',
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
