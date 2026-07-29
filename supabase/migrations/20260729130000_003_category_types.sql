-- ════════════════════════════════════════════════════════════════
-- [F-ID: SQL-003-CATEGORY-TYPES]
-- @project     nestjs-ai-provider-finance (portfolio)
-- @description Adds applies_to to categories (expense|income|both)
--              and seeds income-specific categories. Before this,
--              the closed catalog was 8 expense-shaped categories
--              only -- an income transaction (a salary, a refund)
--              had nothing real to classify into and always landed
--              on a category meant for spending. Real daily usage
--              (2 named users, not a demo) surfaced this as a UX
--              gap, not just a cosmetic one.
-- @version     1.0.0
-- @changelog   1.0.0 — applies_to column (default 'expense', so the
--              7 existing spend categories need no explicit update).
--              "Otros" becomes 'both' -- it's the universal fallback
--              (FALLBACK_CATEGORY) for either transaction type, so
--              it can't be expense-only. Three income categories
--              seeded: Salario, Ingreso extra, Reembolso.
-- ════════════════════════════════════════════════════════════════

begin;

alter table public.categories
  add column if not exists applies_to text
    not null default 'expense'
    check (applies_to in ('expense', 'income', 'both'));

comment on column public.categories.applies_to is
  'Which transaction type(s) this category is valid for. Filters the AI classification prompt (per type) and the manual reclassification dropdown -- an income transaction should never offer "Vivienda", and vice versa. "Otros" is ''both'' since it''s the universal fallback (see FALLBACK_CATEGORY).';

update public.categories set applies_to = 'both' where name = 'Otros';

insert into public.categories (name, applies_to) values
  ('Salario', 'income'),
  ('Ingreso extra', 'income'),
  ('Reembolso', 'income')
on conflict (name) do nothing;

commit;
