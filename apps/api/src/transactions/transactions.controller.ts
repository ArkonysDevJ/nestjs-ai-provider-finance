// src/transactions/transactions.controller.ts
// [F-ID: SRC-TRANSACTIONS-CONTROLLER-01]
// @version 1.1.0
// @changelog 1.1.0 — GET /transactions/summary takes an optional
//   ?month=YYYY-MM query param (default: current month), passed
//   straight through to the service. See TransactionsService.getSummary.
// @changelog 1.0.0 — v1 endpoints: POST /transactions, GET /transactions,
//   POST /transactions/:id/reclassify, GET /transactions/summary.
//   All protected by SupabaseAuthGuard.

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
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
