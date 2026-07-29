// src/categories/categories.controller.ts
// [F-ID: SRC-CATEGORIES-CONTROLLER-01]
// @version 1.1.0
// @changelog 1.1.0 — GET /v1/categories?type=income|expense filters
//   to categories valid for that transaction type (plus 'both').
//   Omitting it returns the full catalog, same as before.
// @changelog 1.0.0 — GET /v1/categories. Protected by
//   SupabaseAuthGuard (standard pattern, see guard).

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CurrentSupabase } from '../common/decorators/supabase-client.decorator';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

@Controller('categories')
@UseGuards(SupabaseAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(
    @CurrentSupabase() supabase: SupabaseClient,
    @Query('type') type?: 'income' | 'expense',
  ): Promise<Category[]> {
    return this.categoriesService.findAll(supabase, type);
  }
}
