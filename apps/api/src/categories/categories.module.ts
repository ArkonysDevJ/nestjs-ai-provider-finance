// src/categories/categories.module.ts
// [F-ID: SRC-CATEGORIES-MODULE-01]
// @version 1.0.0
// @changelog 1.0.0 — Categories module. Exports the service so
//   TransactionsService can resolve category_id via a cross-module
//   service call rather than importing a foreign repository
//   directly -- keeps domain boundaries clean between modules.

import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
