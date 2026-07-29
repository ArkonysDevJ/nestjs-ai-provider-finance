-- ════════════════════════════════════════════════════════════════
-- [F-ID: SQL-001-INIT-SCHEMA]
-- @project     nestjs-ai-provider-finance (portfolio)
-- @description Initial schema: categories (seed) + transactions.
--              RLS by user_id (auth.uid()). Generic Supabase
--              Auth + RLS pattern, no dependency on any
--              proprietary schema from another project.
-- @version     1.0.0
-- @changelog   1.0.0 — Initial creation. Two tables: categories
--              (8 seed rows, closed catalog) and transactions
--              (category_id FK, ai_classified, ai_provider for
--              empirical verification of the abstraction pattern).
-- ════════════════════════════════════════════════════════════════

begin;

-- ─── categories ─────────────────────────────────────────────────
-- Closed catalog of 8 categories. Not editable by the end user in
-- v1 -- a scope decision (see brief, "v1 scope -- closed").

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

comment on table public.categories is
  'Closed catalog of classification categories (8 seed rows). No user CRUD in v1.';

insert into public.categories (name) values
  ('Alimentación'),
  ('Transporte'),
  ('Vivienda'),
  ('Salud'),
  ('Entretenimiento'),
  ('Educación'),
  ('Ahorro/Inversión'),
  ('Otros')
on conflict (name) do nothing;

-- ─── transactions ───────────────────────────────────────────────

create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  description    text not null,
  amount         numeric(12,2) not null,
  type           text not null check (type in ('income', 'expense')),
  category_id    uuid not null references public.categories(id),
  ai_classified  boolean not null default false,
  ai_provider    text null check (ai_provider in ('gemini', 'local') or ai_provider is null),
  occurred_at    date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.transactions.ai_classified is
  'true if the category was assigned by AI (vs. manual reclassification by the user).';
comment on column public.transactions.ai_provider is
  'AI provider that classified the transaction (gemini|local). Empirical proof of the abstraction pattern -- persisted per row, not just claimed in the README.';

create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_category_id on public.transactions(category_id);
create index if not exists idx_transactions_occurred_at on public.transactions(occurred_at);

-- automatic updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row
  execute function public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────
-- Standard Supabase pattern: auth.uid() = user_id. No multi-tenant
-- filtering needed -- this project is single-tenant by design (a
-- user only ever sees their own rows).

alter table public.categories enable row level security;
alter table public.transactions enable row level security;

-- categories: public read for any authenticated user
-- (shared catalog, doesn't belong to any single user_id).
drop policy if exists "categories_select_authenticated" on public.categories;
create policy "categories_select_authenticated"
  on public.categories
  for select
  to authenticated
  using (true);

-- transactions: strict isolation by the row's owning user.
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
  on public.transactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
  on public.transactions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
  on public.transactions
  for delete
  to authenticated
  using (auth.uid() = user_id);

commit;
