// src/app.module.ts
// [F-ID: SRC-APP-MODULE-01]
// @version 1.1.0
// @changelog 1.1.0 — Global IP-based ThrottlerGuard (APP_GUARD), 100
//   requests / 5 min per IP across every endpoint. Second, independent
//   layer on top of TransactionsModule's per-user limit on POST
//   /transactions: that one tracks by user.id, which resets to zero for
//   every freshly created account (signup is self-service, direct
//   against Supabase Auth, with no gate in this backend) -- a script
//   could otherwise sign up unlimited accounts and dodge the per-user
//   cap entirely. This guard closes that specific gap by bounding the
//   originating IP regardless of how many accounts it authenticates as.
//   Registered globally (not per-route) so it runs before any
//   controller-level guard and needs no req.user -- IP is available
//   before auth resolves. Limit is deliberately generous (this is a
//   blanket anti-scripting net across the whole API, not the AI-cost-
//   specific control -- that's the tighter 20/5min per-user limit on
//   POST /transactions specifically).
// @changelog 1.0.0 — Root assembly: global ConfigModule +
//   TransactionsModule (which in turn imports AiModule and
//   CategoriesModule).

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 300_000, limit: 100 }]),
    CategoriesModule,
    TransactionsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
