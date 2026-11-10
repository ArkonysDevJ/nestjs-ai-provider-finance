// src/lib/api.ts
// [F-ID: FE-LIB-API-01]
// @version 1.4.0
// @changelog 1.4.0 — listTransactions takes limit and offset, and
//   listAllTransactions loads every page (see ./paging). The totals of the
//   summary are decimal strings, or numbers from an API deployed earlier;
//   ./money reads both without floating point arithmetic.
// @changelog 1.3.0 — Rate-limit message moved from transactionForm.
//   rateLimited to a shared errors.rateLimited key. authorizedFetch is
//   the wrapper used by EVERY endpoint (list/summary/categories, not
//   just createTransaction), and the two rate limits that can trigger a
//   429 here are also both endpoint-agnostic: the global per-IP guard
//   (AppModule, every route) and the per-user guard scoped to POST
//   /transactions. A copy that said "you've created too many
//   transactions" was wrong when the actual 429 came from a GET
//   /transactions or GET /transactions/summary call hitting the global
//   IP limit during heavy testing -- found because App's top-level
//   loadError banner (rendered above the view switcher, so it persists
//   across tab navigation by design) was showing that transaction-
//   specific copy for a failed data *load*, not a failed create.
// @changelog 1.2.0 — A 429 from the backend (POST /transactions rate
//   limit, see TransactionsController) now throws a translated,
//   human-readable message instead of the raw response body --
//   previously this rendered a literal JSON blob like `429 Too Many
//   Requests: {"statusCode":429,"message":"ThrottlerException: Too Many
//   Requests"}` straight into the error <span>, since App.tsx's error
//   handling is generic (err.message, no status-code branching). Every
//   other status code keeps the existing raw-body behavior -- this is a
//   targeted fix for the one status this app deliberately triggers by
//   design (the rate limit), not a general error-handling rewrite.
// @changelog 1.1.0 — getSummary(month?) forwards an optional
//   ?month=YYYY-MM query param to GET /transactions/summary. See
//   TransactionsService.getSummary on the backend for the filtering
//   rules (byCategory scoped to month, byMonth stays historical).
// @changelog 1.0.0 — Wrapper fetch hacia el backend. Adjunta el
//   access_token de la sesión Supabase activa como Bearer token en
//   cada request -- el backend lo valida vía SupabaseAuthGuard.

import { supabase } from './supabase';
import i18n from '../i18n';
import { fetchAllPages } from './paging';

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
    if (response.status === 429) {
      throw new Error(i18n.t('errors.rateLimited'));
    }
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
    totalExpense: string | number; // decimal text; a number from an older API
    totalIncome: string | number;
    transactionCount: number;
  }>;
  byMonth: Array<{
    month: string;
    totalExpense: string | number; // decimal text; a number from an older API
    totalIncome: string | number;
    transactionCount: number;
  }>;
}

export const api = {
  listCategories: (): Promise<Category[]> => authorizedFetch('/categories'),

  listTransactions: (limit?: number, offset?: number): Promise<Transaction[]> =>
    authorizedFetch(
      limit === undefined && offset === undefined
        ? '/transactions'
        : `/transactions?limit=${limit ?? 100}&offset=${offset ?? 0}`,
    ),

  // Every page of the list, so the view does not depend on the page size.
  listAllTransactions: (): Promise<Transaction[]> =>
    fetchAllPages((limit, offset) => api.listTransactions(limit, offset)),

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
