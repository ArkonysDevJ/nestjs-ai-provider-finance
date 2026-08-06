// src/transactions/transactions.controller.ts
// [F-ID: SRC-TRANSACTIONS-CONTROLLER-01]
// @version 1.2.0
// @changelog 1.2.0 — POST /transactions rate-limited to 20 requests per
//   5 minutes per authenticated user (UserThrottlerGuard + @Throttle()).
//   This is the only endpoint that calls the AI provider per request
//   (Gemini in production) -- unbounded, it's a direct spend vector,
//   and the account most exposed to it is the public demo login in the
//   README, not just a theoretical abuse case. UserThrottlerGuard is
//   applied at the method level, after the controller's class-level
//   SupabaseAuthGuard, so req.user is already populated when the
//   throttler's tracker reads it. Found and closed during the same
//   security review that added FORCE ROW LEVEL SECURITY and the
//   negative RLS test suite -- see README "Testing".
// @changelog 1.1.0 — GET /transactions/summary takes an optional
//   ?month=YYYY-MM query param (default: current month), passed
//   straight through to the service. See TransactionsService.getSummary.
// @changelog 1.0.0 — v1 endpoints: POST /transactions, GET /transactions,
//   POST /transactions/:id/reclassify, GET /transactions/summary.
//   All protected by SupabaseAuthGuard.

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { CurrentSupabase } from '../common/decorators/supabase-client.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/supabase-auth.guard';
import {
  TransactionsService,
  TransactionWithCategory,
} from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ReclassifyTransactionDto } from './dto/reclassify-transaction.dto';
import { SummaryResponse } from './dto/summary-response.dto';
import { Transaction } from './entities/transaction.entity';

@Controller('transactions')
@UseGuards(SupabaseAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ 'create-transaction': { limit: 20, ttl: 300_000 } })
  create(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransactionDto,
  ): Promise<Transaction> {
    return this.transactionsService.create(supabase, user.id, dto);
  }

  @Get()
  findAll(
    @CurrentSupabase() supabase: SupabaseClient,
  ): Promise<TransactionWithCategory[]> {
    return this.transactionsService.findAll(supabase);
  }

  @Get('summary')
  getSummary(
    @CurrentSupabase() supabase: SupabaseClient,
    @Query('month') month?: string,
  ): Promise<SummaryResponse> {
    return this.transactionsService.getSummary(supabase, month);
  }

  @Post(':id/reclassify')
  reclassify(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReclassifyTransactionDto,
  ): Promise<Transaction> {
    return this.transactionsService.reclassify(supabase, id, dto);
  }
}
