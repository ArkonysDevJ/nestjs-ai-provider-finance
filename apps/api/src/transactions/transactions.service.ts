// src/transactions/transactions.service.ts
// [F-ID: SRC-TRANSACTIONS-SERVICE-01]
// @version 1.5.0
// @changelog 1.5.0 — getSummary() calls the database function
//   get_transactions_summary and does no arithmetic on amounts: the totals are
//   decimal strings and the summary is exact whatever the number of rows, since
//   one document comes back instead of every row (which the REST layer caps).
//   findAll() is paged with limit and offset in a total order (occurred_at,
//   created_at and id, all descending).
// @changelog 1.4.0 — Every Supabase call goes through the shared error mapping
//   (common/errors), so no message of the database or the REST layer reaches
//   a response. The lookups of reclassify() no longer ignore their errors, and
//   reads are retried once when the token is refused for being issued in the
//   future. Writes are never retried.
// @changelog 1.3.0 — Description normalization: capitalize first letter of
//   description before AI classification and before insert. Applied at the
//   service entry point so it's consistent regardless of client (Bruno,
//   frontend, or any future API consumer). Only the first character of the
//   full string, NOT title-case -- avoids mangling proper nouns or
//   abbreviations the user typed intentionally ("iPhone", "BBVA deposit").
//   Forward-only: no data migration for existing rows.
// @changelog 1.2.0 — Type-aware category catalog enforced server-side,
//   not just prompt-side. create(): categories fetched pre-filtered
//   by dto.type (categoriesService.findAll(supabase, dto.type)), so
//   a misbehaving AI response outside the allowed list can't match
//   and falls through to FALLBACK_CATEGORY ("Otros", present in both
//   filtered sets). reclassify(): validates the target category's
//   applies_to against the transaction's actual type before updating
//   -- rejects e.g. reclassifying an expense into "Salario". This is
//   the server-side half of the applies_to contract (see
//   supabase/migrations/003_category_types.sql); the frontend
//   dropdown filter is the other half, but the API must not trust
//   the client alone.
// @changelog 1.1.0 — getSummary() takes an optional month (YYYY-MM),
//   defaulting to the current calendar month. byCategory is computed
//   only from that month's rows; byMonth is still computed from every
//   row regardless of the filter -- it's the historical trend view,
//   byCategory is the "where did this month's money go" view. Both
//   read from a single fetch (all rows), filtered in JS, to avoid a
//   second round-trip to Supabase.
// @changelog 1.0.0 — CRUD + AI classification + manual reclassification
//   + summary aggregates. Depends on AI_PROVIDER (interface, not a
//   concrete SDK) and CategoriesService (cross-module via a public
//   service, never importing its repository directly -- see comment
//   in CategoriesModule).

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AI_PROVIDER,
  AIProvider,
  FALLBACK_CATEGORY,
} from '../ai/ai-provider.interface.js';
import { CategoriesService } from '../categories/categories.service.js';
import {
  GENERIC_MESSAGES,
  mapBackendError,
} from '../common/errors/map-error.js';
import { readWithRetry } from '../common/errors/retry.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { ReclassifyTransactionDto } from './dto/reclassify-transaction.dto.js';
import { SummaryResponse } from './dto/summary-response.dto.js';
import { DEFAULT_LIST_LIMIT } from './dto/list-transactions-query.dto.js';
import { Transaction } from './entities/transaction.entity.js';

export interface TransactionWithCategory extends Transaction {
  categories: { id: string; name: string } | null;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly aiProvider: AIProvider,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(
    supabase: SupabaseClient,
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    // Capitalize the first letter of description before classification and
    // insert. Only the first char of the full string -- not title-case --
    // to avoid mangling "iPhone", "BBVA", or any user-intentional casing.
    const trimmed = dto.description.trim();
    const normalizedDescription =
      trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

    const classification = await this.aiProvider.classify({
      description: normalizedDescription,
      amount: dto.amount,
      type: dto.type,
    });

    const categories = await this.categoriesService.findAll(supabase, dto.type);
    const resolvedCategory =
      categories.find(
        (c) =>
          c.name.toLowerCase() === classification.categoryName.toLowerCase(),
      ) ?? categories.find((c) => c.name === FALLBACK_CATEGORY);

    if (!resolvedCategory) {
      // Shouldn't happen with the seed applied. The detail goes to the log;
      // the response says nothing about the catalog.
      this.logger.error(
        `Fallback category "${FALLBACK_CATEGORY}" not found in the catalog. Were the migrations in supabase/migrations/ applied?`,
      );
      throw new InternalServerErrorException(GENERIC_MESSAGES.internal);
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        description: normalizedDescription,
        amount: dto.amount,
        type: dto.type,
        category_id: resolvedCategory.id,
        // The old columns keep their meaning; readers use classification_status.
        ai_classified: true,
        ai_provider: this.aiProvider.providerName,
        classification_status: classification.status,
        classification_reason:
          classification.status === 'fallback' ? classification.reason : null,
        ai_model: classification.model,
        occurred_at: dto.occurredAt ?? new Date().toISOString().slice(0, 10),
      })
      .select('*')
      .single();

    if (error) {
      throw mapBackendError(error);
    }

    return data as Transaction;
  }

  async findAll(
    supabase: SupabaseClient,
    page: { limit?: number; offset?: number } = {},
  ): Promise<TransactionWithCategory[]> {
    const limit = page.limit ?? DEFAULT_LIST_LIMIT;
    const offset = page.offset ?? 0;
    // A total order: the date, then the creation time, then the id, so two rows
    // never swap places between two pages.
    const { data, error } = await readWithRetry(() =>
      supabase
        .from('transactions')
        .select('*, categories(id, name)')
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1),
    );

    if (error) {
      throw mapBackendError(error);
    }

    return data as TransactionWithCategory[];
  }

  async reclassify(
    supabase: SupabaseClient,
    id: string,
    dto: ReclassifyTransactionDto,
  ): Promise<Transaction> {
    const { data: txRow, error: txError } = await readWithRetry(() =>
      supabase.from('transactions').select('type').eq('id', id).maybeSingle(),
    );

    if (txError) {
      throw mapBackendError(txError);
    }
    if (!txRow) {
      throw new NotFoundException(
        `Transaction ${id} not found or does not belong to the authenticated user.`,
      );
    }
    const transactionType = (txRow as { type: 'income' | 'expense' }).type;

    const { data: categoryRow, error: categoryError } = await readWithRetry(
      () =>
        supabase
          .from('categories')
          .select('applies_to')
          .eq('id', dto.categoryId)
          .maybeSingle(),
    );

    if (categoryError) {
      throw mapBackendError(categoryError);
    }

    // If the category doesn't exist at all, don't duplicate that
    // error here -- let the update below hit the FK constraint and
    // go through the existing 23503 mapping.
    if (
      categoryRow &&
      categoryRow.applies_to !== 'both' &&
      categoryRow.applies_to !== transactionType
    ) {
      throw new BadRequestException(
        `This category doesn't apply to a "${transactionType}" transaction.`,
      );
    }

    const { data, error } = await supabase
      .from('transactions')
      // Only category_id: the database derives the manual state.
      .update({ category_id: dto.categoryId })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw mapBackendError(error);
    }

    if (!data) {
      // RLS silently filters out rows that aren't the caller's own
      // (0 rows), and a nonexistent id produces the same result --
      // both cases are "not found" from the authenticated user's
      // point of view.
      throw new NotFoundException(
        `Transaction ${id} not found or does not belong to the authenticated user.`,
      );
    }

    return data as Transaction;
  }

  async getSummary(
    supabase: SupabaseClient,
    month?: string,
  ): Promise<SummaryResponse> {
    const selectedMonth = month ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)) {
      throw new BadRequestException(
        `Invalid month "${selectedMonth}". Expected format: YYYY-MM.`,
      );
    }

    // The database function sums the amounts with exact decimals and returns one
    // document, so nothing here adds numbers and no row cap can truncate it.
    const { data, error } = await readWithRetry(() =>
      supabase.rpc('get_transactions_summary', { p_month: selectedMonth }),
    );

    if (error) {
      throw mapBackendError(error);
    }

    return data as SummaryResponse;
  }
}
