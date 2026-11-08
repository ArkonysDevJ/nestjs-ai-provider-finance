-- Expand stage of spec 003: classification state, database invariants, explicit
-- privileges, the summary function and the demo identity guard.
--
-- Nothing here removes something the running API still uses. The API keeps
-- writing `ai_classified` and `ai_provider`, and does not know the new columns.
-- The contract stage (supabase/contract) tightens this after specs 004 and 005
-- are deployed.
--
-- Everything runs in one transaction, with short lock waits: the table is small
-- and a lock that cannot be taken quickly aborts the whole migration.

begin;

set local lock_timeout = '5s';

-- ─── 1. Classification columns ─────────────────────────────────────────────

alter table public.transactions
  add column classification_status text,
  add column classification_reason text,
  add column ai_model text;

alter table public.transactions
  add constraint transactions_classification_status_check
    check (classification_status in ('ai', 'fallback', 'manual', 'legacy')),
  add constraint transactions_classification_reason_check
    check (classification_reason in ('provider_error', 'timeout', 'quota_exceeded', 'invalid_output')),
  -- The reason is set if and only if the status is 'fallback'. A null status
  -- counts as "not a fallback", so a null status with a reason is rejected too.
  add constraint transactions_reason_iff_fallback_check
    check (coalesce(classification_status = 'fallback', false) = (classification_reason is not null));

comment on column public.transactions.classification_status is
  'How the category was set: ai, fallback (the provider failed), manual (the user chose it) or legacy (set before this column existed). Null only for rows written by code that predates this column.';
comment on column public.transactions.classification_reason is
  'Why a fallback happened. Set if and only if classification_status is fallback.';
comment on column public.transactions.ai_model is
  'Model that produced the classification, when known. The API records it at creation; the database does not verify it.';

-- ─── 2. Backfill, before any trigger that guards these columns exists ──────
-- Existing rows: ai_classified = false becomes manual, ai_classified = true
-- becomes legacy. The updated_at trigger is disabled by name for the statement,
-- so the backfill does not touch the modification time of every row.

alter table public.transactions disable trigger trg_transactions_updated_at;

update public.transactions
set classification_status = case when ai_classified then 'legacy' else 'manual' end
where classification_status is null;

alter table public.transactions enable trigger trg_transactions_updated_at;

-- ─── 3. Amount must be positive ────────────────────────────────────────────
-- Added validated in one step: the measured data has no row that violates it.

alter table public.transactions
  add constraint transactions_amount_positive_check check (amount > 0);

-- ─── 4. Triggers ───────────────────────────────────────────────────────────

-- 4a. The category must apply to the transaction type (or to both).
-- A missing category is left to the foreign key, which reports it.
create function public.transactions_check_category_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_applies_to text;
begin
  select c.applies_to
    into v_applies_to
    from public.categories c
   where c.id = new.category_id;

  if not found then
    return new;
  end if;

  if v_applies_to not in (new.type, 'both') then
    raise exception 'category does not apply to the transaction type'
      using errcode = 'TX001';
  end if;

  return new;
end;
$$;

create trigger trg_transactions_category_type
  before insert or update of category_id, type on public.transactions
  for each row
  execute function public.transactions_check_category_type();

-- 4b. Guard of the classification columns.
--   insert: the status is null (and then the reason is null), or ai or fallback.
--           The contract stage requires ai or fallback.
--   update: a direct change of the status, the reason or the model is rejected;
--           a change of category_id derives the manual state.
-- The guard has no exception for any role. A maintenance change goes through a
-- migration that disables this trigger by name inside its transaction.
create function public.transactions_classification_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.classification_status is null then
      if new.classification_reason is not null then
        raise exception 'a classification reason requires a fallback status'
          using errcode = 'TX002';
      end if;
    elsif new.classification_status not in ('ai', 'fallback') then
      raise exception 'classification status cannot be set to this value on insert'
        using errcode = 'TX002';
    end if;
    return new;
  end if;

  if new.classification_status is distinct from old.classification_status
     or new.classification_reason is distinct from old.classification_reason
     or new.ai_model is distinct from old.ai_model then
    raise exception 'classification columns cannot be changed directly'
      using errcode = 'TX002';
  end if;

  if new.category_id is distinct from old.category_id then
    new.classification_status := 'manual';
    new.classification_reason := null;
    new.ai_model := null;
    new.ai_classified := false;
    new.ai_provider := null;
  end if;

  return new;
end;
$$;

-- The name sorts after trg_transactions_category_type and before
-- trg_transactions_updated_at, which is the order the triggers should run in.
create trigger trg_transactions_classification_guard
  before insert or update on public.transactions
  for each row
  execute function public.transactions_classification_guard();

-- ─── 5. Privileges ─────────────────────────────────────────────────────────

-- 5a. Remove everything that exists on the two tables, from every client role
-- and from PUBLIC, including the privileges that bypass row level security
-- (truncate) or add no data access (references, trigger, maintain).
revoke select, insert, update, delete, truncate, references, trigger, maintain
  on table public.categories, public.transactions
  from public, anon, authenticated;

-- service_role has no data privileges here and nothing in this project uses it.
-- Kept as its own statement so that it can be dropped from the migration without
-- touching the rest.
revoke select, insert, update, delete, truncate, references, trigger, maintain
  on table public.categories, public.transactions
  from service_role;
revoke all on function
  public.ping(),
  public.set_updated_at(),
  public.transactions_check_category_type(),
  public.transactions_classification_guard()
  from service_role;

-- 5b. Grant exactly the matrix.
-- PUBLIC keeps USAGE on the schema, as the platform grants it: with every
-- privilege revoked from PUBLIC on the objects below, USAGE alone reaches no
-- object. Only CREATE is revoked, which is what stops PUBLIC from adding objects.
revoke create on schema public from public;
grant usage on schema public to anon, authenticated;

grant select on public.categories to authenticated;
grant select, insert, update on public.transactions to authenticated;
-- No delete privilege. The delete policy is dropped as well, so that a later
-- re-grant of the privilege by mistake still finds no policy that allows it.
drop policy if exists transactions_delete_own on public.transactions;

-- 5c. New objects created by this role in public start with no privileges.
-- A per-schema default can only undo a per-schema grant; the built-in
-- execute-for-PUBLIC default on functions is removed globally for this role.
alter default privileges in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges
  revoke execute on functions from public;

-- 5d. Functions.
alter function public.ping() set search_path = '';
revoke all on function public.ping() from public, anon, authenticated;
grant execute on function public.ping() to anon;

alter function public.set_updated_at() set search_path = '';
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- The trigger functions of section 4 were created before the default privileges
-- above changed, so they still carry the execute privilege of PUBLIC. A trigger
-- function needs no execute privilege at the time it fires.
revoke all on function public.transactions_check_category_type() from public, anon, authenticated;
revoke all on function public.transactions_classification_guard() from public, anon, authenticated;

-- rls_auto_enable() is provided by the platform and exists on the hosted
-- project only. It returns event_trigger, so it is not callable as a function;
-- the revoke removes the execute privilege that PUBLIC holds by default, and
-- the one that service_role may hold, for symmetry with the other functions.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end;
$$;

-- ─── 6. Summary function ───────────────────────────────────────────────────
-- Runs as the caller, so row level security applies. Totals are decimal text
-- with two places. byMonth covers every row of the caller; byCategory covers the
-- selected month only. Ties in byCategory sort by name.

create function public.get_transactions_summary(p_month text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_month text := coalesce(p_month, to_char(current_date, 'YYYY-MM'));
  v_from  date;
begin
  if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid month, expected YYYY-MM'
      using errcode = '22023';
  end if;

  v_from := (v_month || '-01')::date;

  return jsonb_build_object(
    'selectedMonth', v_month,
    'byCategory', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'categoryId', s.category_id,
                 'categoryName', s.name,
                 'totalExpense', round(s.total_expense, 2)::text,
                 'totalIncome', round(s.total_income, 2)::text,
                 'transactionCount', s.transaction_count)
               order by s.total_expense desc, s.name asc)
        from (
          select t.category_id,
                 c.name,
                 sum(case when t.type = 'expense' then t.amount else 0 end) as total_expense,
                 sum(case when t.type = 'income' then t.amount else 0 end) as total_income,
                 count(*) as transaction_count
            from public.transactions t
            join public.categories c on c.id = t.category_id
           where t.occurred_at >= v_from
             and t.occurred_at < (v_from + interval '1 month')
           group by t.category_id, c.name
        ) s
    ), '[]'::jsonb),
    'byMonth', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'month', m.month,
                 'totalExpense', round(m.total_expense, 2)::text,
                 'totalIncome', round(m.total_income, 2)::text,
                 'transactionCount', m.transaction_count)
               order by m.month asc)
        from (
          select to_char(t.occurred_at, 'YYYY-MM') as month,
                 sum(case when t.type = 'expense' then t.amount else 0 end) as total_expense,
                 sum(case when t.type = 'income' then t.amount else 0 end) as total_income,
                 count(*) as transaction_count
            from public.transactions t
           group by to_char(t.occurred_at, 'YYYY-MM')
        ) m
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_transactions_summary(text) from public;
grant execute on function public.get_transactions_summary(text) to authenticated;

-- ─── 7. Demo account identity ──────────────────────────────────────────────
-- Anyone can sign in to the demo account, so its password, e-mail and phone must
-- not change. The trigger compares values, so an update that rewrites the same
-- values (as the auth service does) is allowed. It is created only when the
-- migration role may create triggers on auth.users; otherwise the account is
-- regenerated by hand and a warning is printed.

create function public.reject_demo_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id = '94f56c85-36dd-4feb-89ae-92254754fc93'::uuid
     and (new.encrypted_password is distinct from old.encrypted_password
          or new.email is distinct from old.email
          or new.phone is distinct from old.phone) then
    raise exception 'the identity of the demo account cannot be changed'
      using errcode = 'TX003';
  end if;
  return new;
end;
$$;

do $$
begin
  if has_table_privilege(current_user, 'auth.users', 'TRIGGER') then
    drop trigger if exists trg_demo_identity_guard on auth.users;
    create trigger trg_demo_identity_guard
      before update of encrypted_password, email, phone on auth.users
      for each row
      execute function public.reject_demo_identity_change();
  else
    raise warning 'demo identity trigger skipped: the migration role cannot create triggers on auth.users';
  end if;
end;
$$;

commit;
