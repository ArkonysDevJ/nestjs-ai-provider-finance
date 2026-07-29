// src/app.module.ts
// [F-ID: SRC-APP-MODULE-01]
// @version 1.0.0
// @changelog 1.0.0 — Root assembly: global ConfigModule +
//   TransactionsModule (which in turn imports AiModule and
//   CategoriesModule).

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CategoriesModule,
    TransactionsModule,
  ],
})
export class AppModule {}
