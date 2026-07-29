// src/lib/api.ts
// [F-ID: FE-LIB-API-01]
// @version 1.1.0
// @changelog 1.1.0 — getSummary(month?) forwards an optional
//   ?month=YYYY-MM query param to GET /transactions/summary. See
//   TransactionsService.getSummary on the backend for the filtering
//   rules (byCategory scoped to month, byMonth stays historical).
// @changelog 1.0.0 — Wrapper fetch hacia el backend. Adjunta el
//   access_token de la sesión Supabase activa como Bearer token en
//   cada request -- el backend lo valida vía SupabaseAuthGuard.

import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL as string;

async function authorizedFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error('No hay sesión activa');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return response.json();
}

export interface Category {
  id: string;
  name: string;
  applies_to: 'expense' | 'income' | 'both';
  created_at: string;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category_id: string;
  ai_classified: boolean;
  ai_provider: 'gemini' | 'local' | null;
  occurred_at: string;
  categories: { id: string; name: string } | null;
}

export interface SummaryResponse {
  selectedMonth: string;
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    totalExpense: number;
    totalIncome: number;
    transactionCount: number;
  }>;
  byMonth: Array<{
    month: string;
    totalExpense: number;
    totalIncome: number;
    transactionCount: number;
  }>;
}

export const api = {
  listCategories: (): Promise<Category[]> => authorizedFetch('/categories'),

  listTransactions: (): Promise<Transaction[]> =>
    authorizedFetch('/transactions'),

  createTransaction: (input: {
    description: string;
    amount: number;
    type: 'income' | 'expense';
    occurredAt?: string; // YYYY-MM-DD; omit to use backend default (today)
  }): Promise<Transaction> =>
    authorizedFetch('/transactions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  reclassifyTransaction: (
    id: string,
    categoryId: string,
  ): Promise<Transaction> =>
    authorizedFetch(`/transactions/${id}/reclassify`, {
      method: 'POST',
      body: JSON.stringify({ categoryId }),
    }),

  getSummary: (month?: string): Promise<SummaryResponse> =>
    authorizedFetch(
      month
        ? `/transactions/summary?month=${encodeURIComponent(month)}`
        : '/transactions/summary',
    ),
};
