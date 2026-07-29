// src/transactions/dto/reclassify-transaction.dto.ts
// [F-ID: SRC-TRANSACTIONS-DTO-RECLASSIFY-01]
// @version 1.0.0
// @changelog 1.0.0 — POST /transactions/:id/reclassify. Explicit
//   manual reclassification by the user -- sets ai_classified=false
//   and clears ai_provider (no longer attributable to an AI provider).

import { IsNotEmpty, IsUUID } from 'class-validator';

export class ReclassifyTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;
}
