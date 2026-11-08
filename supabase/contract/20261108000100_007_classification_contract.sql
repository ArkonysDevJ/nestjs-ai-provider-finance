-- Contract stage of spec 003. It is NOT in supabase/migrations on purpose: it
-- must be applied only after the code of specs 004 and 005 is deployed and
-- verified, because that code is what writes the classification columns. The
-- maintainer moves this file into supabase/migrations at that point.
--
-- It tightens what the expand stage left open:
--   - rows still without a status are filled as legacy;
--   - the owner can no longer update ai_classified and ai_provider (nor any other
--     column except category_id);
--   - classification_status becomes NOT NULL;
--   - an insert must carry a status of ai or fallback.

begin;

set local lock_timeout = '5s';

-- 1. Fill the rows that the old code wrote without a status. The guard trigger
-- would reject this change, so it is disabled by name for the statement and
-- enabled again in the same transaction. Only these two triggers are touched:
-- never ALL, which would also switch off the foreign key triggers. The
-- updated_at trigger is disabled too, so the fill does not touch the
-- modification time of the rows.
alter table public.transactions disable trigger trg_transactions_classification_guard;
alter table public.transactions disable trigger trg_transactions_updated_at;

update public.transactions
set classification_status = 'legacy'
where classification_status is null;

alter table public.transactions enable trigger trg_transactions_classification_guard;
alter table public.transactions enable trigger trg_transactions_updated_at;

-- 2. The status is required from now on.
alter table public.transactions
  alter column classification_status set not null;

-- 3. Client roles can update category_id only. Revoking the table-level
-- privilege also removes the column-level ones.
revoke update on public.transactions from authenticated;
grant update (category_id) on public.transactions to authenticated;

-- 4. An insert must declare how the category was set.
create or replace function public.transactions_classification_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.classification_status is null
       or new.classification_status not in ('ai', 'fallback') then
      raise exception 'classification status must be ai or fallback on insert'
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

commit;
