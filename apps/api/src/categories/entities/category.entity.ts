// src/categories/entities/category.entity.ts
// [F-ID: SRC-CATEGORIES-ENTITY-01]
// @version 1.1.0
// @changelog 1.1.0 — applies_to added, mirrors the column from
//   supabase/migrations/003_category_types.sql. Which transaction
//   type(s) this category is valid for -- 'both' only for the
//   universal fallback (see FALLBACK_CATEGORY).
// @changelog 1.0.0 — Row shape returned by public.categories.

export type CategoryAppliesTo = 'expense' | 'income' | 'both';

export interface Category {
  id: string;
  name: string;
  applies_to: CategoryAppliesTo;
  created_at: string;
}
