// src/transactions/dto/list-transactions-query.dto.ts
// [F-ID: SRC-TRANSACTIONS-DTO-LIST-QUERY-01]
// @version 1.0.0
// @changelog 1.0.0 — Query of GET /transactions: limit (1 to 200, default 100)
//   and offset (0 or more). Query values arrive as strings, so they are
//   converted to numbers before they are validated; a value that is not a
//   whole number in range is a 400.

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 200;

export class ListTransactionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_LIMIT)
  limit: number = DEFAULT_LIST_LIMIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
