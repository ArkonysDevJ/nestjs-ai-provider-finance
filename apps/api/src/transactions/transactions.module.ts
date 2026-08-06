// src/transactions/transactions.module.ts
// [F-ID: SRC-TRANSACTIONS-MODULE-01]
// @version 1.1.0
// @changelog 1.1.0 — Imports ThrottlerModule, scoped to this module only
//   (not registered globally via APP_GUARD) -- rate limiting here exists
//   specifically to bound Gemini API spend on POST /transactions, not as
//   a blanket policy for every endpoint. See UserThrottlerGuard for why
//   tracking is per-user rather than per-IP, and TransactionsController
//   for the actual @Throttle() limit applied.
// @changelog 1.0.0 — Imports AiModule (AI_PROVIDER) and CategoriesModule
//   (exported CategoriesService) -- cross-domain communication via
//   public services, never foreign repositories.

import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from '../ai/ai.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    AiModule,
    CategoriesModule,
    ThrottlerModule.forRoot([
      { name: 'create-transaction', ttl: 300_000, limit: 20 },
    ]),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
