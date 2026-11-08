// src/transactions/dto/create-transaction.dto.ts
// [F-ID: SRC-TRANSACTIONS-DTO-CREATE-01]
// @version 1.1.0
// @changelog 1.1.0 — amount has an upper bound (the largest value of
//   numeric(12,2)) and at most two decimals, so an invalid value is a 400 and
//   not a database error.
// @changelog 1.0.0 — Input validation for POST /transactions.
//   category_id is NOT accepted in the body -- it's assigned by
//   the AI (or falls back to "Otros"). TransactionType lives in
//   ai-provider.interface and isn't redeclared here.

import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { TransactionType } from '../../ai/ai-provider.interface.js';

// The largest value of the column numeric(12,2).
export const MAX_AMOUNT = 9_999_999_999.99;

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  amount!: number;

  @IsIn(['income', 'expense'])
  type!: TransactionType;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
