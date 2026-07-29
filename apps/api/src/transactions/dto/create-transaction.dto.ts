// src/transactions/dto/create-transaction.dto.ts
// [F-ID: SRC-TRANSACTIONS-DTO-CREATE-01]
// @version 1.0.0
// @changelog 1.0.0 — Input validation for POST /transactions.
//   category_id is NOT accepted in the body -- it's assigned by
//   the AI (or falls back to "Otros"). TransactionType lives in
//   ai-provider.interface and isn't redeclared here.

import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { TransactionType } from '../../ai/ai-provider.interface';

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  description!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsIn(['income', 'expense'])
  type!: TransactionType;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
