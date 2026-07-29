// src/transactions/transactions.module.ts
// [F-ID: SRC-TRANSACTIONS-MODULE-01]
// @version 1.0.0
// @changelog 1.0.0 — Imports AiModule (AI_PROVIDER) and CategoriesModule
//   (exported CategoriesService) -- cross-domain communication via
//   public services, never foreign repositories.

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [AiModule, CategoriesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
