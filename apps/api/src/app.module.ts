// src/app.module.ts
// [F-ID: SRC-APP-MODULE-01]
// @version 1.3.0
// @changelog 1.3.0 — The global per-IP ThrottlerGuard is gone: behind Cloud Run
//   every client shared the address of the proxy, so one bucket counted all of
//   them. RateLimitModule registers a limiter of the project's own as a global
//   guard (it runs before authentication), and the only ThrottlerModule is the
//   one of TransactionsModule, for the per-user limit on POST /transactions.
// @changelog 1.2.0 — Register HealthModule (GET /v1/health). Backs the
//   Supabase keep-alive automation (.github/workflows/keep-alive.yml):
//   an unattended scheduler pings it every few days so the free-tier
//   project never accumulates the ~7 days of inactivity that triggers
//   an auto-pause. Deliberately outside SupabaseAuthGuard's reach —
//   see HealthController/HealthService for why.
// @changelog 1.1.0 — Global IP-based ThrottlerGuard (APP_GUARD), replaced in
//   1.3.0; see there.
// @changelog 1.0.0 — Root assembly: global ConfigModule +
//   TransactionsModule (which in turn imports AiModule and
//   CategoriesModule).

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionsModule } from './transactions/transactions.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { HealthModule } from './health/health.module.js';
import { RateLimitModule } from './common/guards/rate-limit.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RateLimitModule,
    CategoriesModule,
    TransactionsModule,
    HealthModule,
  ],
})
export class AppModule {}
