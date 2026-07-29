// src/transactions/entities/transaction.entity.ts
// [F-ID: SRC-TRANSACTIONS-ENTITY-01]
// @version 1.0.0
// @changelog 1.0.0 — Row shape returned by public.transactions.
//   Mirrors the schema in supabase/migrations/.

import { AiProviderName, TransactionType } from '../../ai/ai-provider.interface';

export interface Transaction {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category_id: string;
  ai_classified: boolean;
  ai_provider: AiProviderName | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}
