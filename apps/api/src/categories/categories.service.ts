// src/categories/categories.service.ts
// [F-ID: SRC-CATEGORIES-SERVICE-01]
// @version 1.2.0
// @changelog 1.2.0 — A failing query is mapped by the shared error mapping
//   instead of being thrown as the raw error object, and the read is retried
//   once when the token is refused for being issued in the future.
// @changelog 1.1.0 — findAll() takes an optional type filter
//   ('income' | 'expense'), returning only categories where
//   applies_to matches that type or is 'both'. Without it, every
//   category is returned (unfiltered), same as before.
// @changelog 1.0.0 — Reads the closed catalog of 8 categories.
//   No CRUD -- out of v1 scope (fixed catalog, see brief).

import { Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapBackendError } from '../common/errors/map-error.js';
import { readWithRetry } from '../common/errors/retry.js';
import { Category } from './entities/category.entity.js';

@Injectable()
export class CategoriesService {
  async findAll(
    supabase: SupabaseClient,
    type?: 'income' | 'expense',
  ): Promise<Category[]> {
    let query = supabase.from('categories').select('*');

    if (type) {
      query = query.or(`applies_to.eq.${type},applies_to.eq.both`);
    }

    const { data, error } = await readWithRetry(() =>
      query.order('name', { ascending: true }),
    );

    if (error) {
      throw mapBackendError(error);
    }

    return data as Category[];
  }
}
