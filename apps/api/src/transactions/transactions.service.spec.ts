import { TransactionsService } from './transactions.service.js';
import type {
  AIProvider,
  ClassificationResult,
} from '../ai/ai-provider.interface.js';
import type { CategoriesService } from '../categories/categories.service.js';
import { fakeSupabase } from '../../test/support/fake-supabase.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { GENERIC_MESSAGES } from '../common/errors/map-error.js';

const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentación', applies_to: 'expense' },
  { id: 'cat-other', name: 'Otros', applies_to: 'both' },
];

function fakeProvider(result: ClassificationResult): AIProvider {
  return { providerName: 'gemini', classify: async () => result };
}

const categoriesService = {
  findAll: async () => CATEGORIES,
} as unknown as CategoriesService;

const dto = {
  description: 'weekly groceries',
  amount: 42,
  type: 'expense' as const,
};

describe('TransactionsService.create', () => {
  async function create(result: ClassificationResult) {
    const db = fakeSupabase();
    db.answer('transactions', 'insert', { data: { id: 'tx-1' }, error: null });
    const service = new TransactionsService(
      fakeProvider(result),
      categoriesService,
    );
    await service.create(db.client, 'user-1', dto);
    const insert = db.calls.find((c) => c.operation === 'insert');
    return insert!.payload!;
  }

  it('004 AC-5: a real classification is stored with its status, no reason and the model', async () => {
    const row = await create({
      status: 'ai',
      categoryName: 'Alimentación',
      model: 'served-model',
    });
    expect(row).toMatchObject({
      category_id: 'cat-food',
      classification_status: 'ai',
      classification_reason: null,
      ai_model: 'served-model',
    });
  });

  it('004 AC-5: a fallback is stored as a fallback with its reason and the requested model, never as ai', async () => {
    const row = await create({
      status: 'fallback',
      categoryName: 'Otros',
      reason: 'quota_exceeded',
      model: 'requested-model',
    });
    expect(row).toMatchObject({
      category_id: 'cat-other',
      classification_status: 'fallback',
      classification_reason: 'quota_exceeded',
      ai_model: 'requested-model',
    });
    expect(row.classification_status).not.toBe('ai');
  });

  it('004 AC-5: ai_classified and ai_provider keep their current meaning', async () => {
    const row = await create({
      status: 'fallback',
      categoryName: 'Otros',
      reason: 'timeout',
      model: 'requested-model',
    });
    expect(row).toMatchObject({ ai_classified: true, ai_provider: 'gemini' });
  });
});

describe('TransactionsService.reclassify', () => {
  it('004 AC-6: sends only category_id', async () => {
    const db = fakeSupabase();
    db.answer('transactions', 'select', {
      data: { type: 'expense' },
      error: null,
    });
    db.answer('categories', 'select', {
      data: { applies_to: 'expense' },
      error: null,
    });
    db.answer('transactions', 'update', { data: { id: 'tx-1' }, error: null });
    const service = new TransactionsService(
      fakeProvider({ status: 'ai', categoryName: 'Otros', model: 'm' }),
      categoriesService,
    );

    await service.reclassify(db.client, 'tx-1', { categoryId: 'cat-food' });

    const update = db.calls.find((c) => c.operation === 'update');
    expect(update!.payload).toEqual({ category_id: 'cat-food' });
  });
});

const futureToken = { code: 'PGRST303', message: 'JWT issued at future' };

function service(
  result: ClassificationResult = {
    status: 'ai',
    categoryName: 'Otros',
    model: 'm',
  },
) {
  return new TransactionsService(fakeProvider(result), categoriesService);
}

describe('TransactionsService.getSummary', () => {
  const summary = {
    selectedMonth: '2026-03',
    byCategory: [
      {
        categoryId: 'cat-food',
        categoryName: 'Alimentación',
        totalExpense: '120.00',
        totalIncome: '0.00',
        transactionCount: 1200,
      },
    ],
    byMonth: [
      {
        month: '2026-03',
        totalExpense: '1234.50',
        totalIncome: '1000.50',
        transactionCount: 1202,
      },
    ],
  };

  it('006 AC-3: returns the document of the database function as it is, with the totals as decimal strings and the counts as numbers', async () => {
    const db = fakeSupabase();
    db.answer('get_transactions_summary', 'rpc', {
      data: summary,
      error: null,
    });

    const result = await service().getSummary(db.client, '2026-03');

    expect(result).toBe(summary);
    expect(typeof result.byMonth[0].totalExpense).toBe('string');
    expect(typeof result.byCategory[0].totalIncome).toBe('string');
    expect(typeof result.byMonth[0].transactionCount).toBe('number');
  });

  it('006 AC-3: asks the function for the month and reads no row', async () => {
    const db = fakeSupabase();
    db.answer('get_transactions_summary', 'rpc', {
      data: summary,
      error: null,
    });

    await service().getSummary(db.client, '2026-03');

    expect(db.calls).toEqual([
      {
        table: 'get_transactions_summary',
        operation: 'rpc',
        payload: { p_month: '2026-03' },
      },
    ]);
  });

  it('006 AC-3: without a month it asks for the current month', async () => {
    const db = fakeSupabase();
    db.answer('get_transactions_summary', 'rpc', {
      data: summary,
      error: null,
    });

    await service().getSummary(db.client);

    expect(db.calls[0].payload).toEqual({
      p_month: new Date().toISOString().slice(0, 7),
    });
  });

  it.each(['2026-13', '2026-3', 'march', '2026-00'])(
    '006 AC-3: an invalid month (%s) is a 400 before any call',
    async (month) => {
      const db = fakeSupabase();
      await expect(
        service().getSummary(db.client, month),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.calls).toEqual([]);
    },
  );

  it('006 AC-3: an invalid month reported by the database is a 400', async () => {
    const db = fakeSupabase();
    db.answer('get_transactions_summary', 'rpc', {
      data: null,
      error: { code: '22023', message: 'invalid month, expected YYYY-MM' },
    });
    await expect(
      service().getSummary(db.client, '2026-03'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TransactionsService.findAll: paging', () => {
  it('006 AC-4: orders by date, creation time and id, all descending, and defaults to the first 100', async () => {
    const db = fakeSupabase();
    db.answer('transactions', 'select', { data: [], error: null });

    await service().findAll(db.client);

    const select = db.calls.find((c) => c.operation === 'select')!;
    expect(select.order).toEqual([
      { column: 'occurred_at', ascending: false },
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ]);
    expect(select.range).toEqual([0, 99]);
  });

  it('006 AC-4: limit and offset become an inclusive range', async () => {
    const db = fakeSupabase();
    db.answer('transactions', 'select', { data: [], error: null });

    await service().findAll(db.client, { limit: 5, offset: 10 });

    const select = db.calls.find((c) => c.operation === 'select')!;
    expect(select.range).toEqual([10, 14]);
  });
});

describe('TransactionsService: errors', () => {
  describe('reads', () => {
    it('005 AC-3: a token issued in the future is retried once for a read', async () => {
      const db = fakeSupabase();
      db.answer('transactions', 'select', { data: null, error: futureToken });
      db.answer('transactions', 'select', {
        data: [{ id: 'tx-1' }],
        error: null,
      });

      await expect(service().findAll(db.client)).resolves.toEqual([
        { id: 'tx-1' },
      ]);
      expect(db.calls.filter((c) => c.operation === 'select')).toHaveLength(2);
    });

    it('005 AC-3: a second failure of the token becomes a 401, after one retry only', async () => {
      const db = fakeSupabase();
      db.answer('transactions', 'select', { data: null, error: futureToken });
      db.answer('transactions', 'select', { data: null, error: futureToken });

      await expect(service().findAll(db.client)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.calls.filter((c) => c.operation === 'select')).toHaveLength(2);
    });

    it('005 AC-2: a read that fails never exposes the backend message', async () => {
      const db = fakeSupabase();
      db.answer('transactions', 'select', {
        data: null,
        error: { code: 'XX000', message: 'connect ECONNREFUSED 10.0.0.5:5432' },
      });
      const failure = await service()
        .findAll(db.client)
        .catch((e) => e);
      expect(failure).toBeInstanceOf(InternalServerErrorException);
      expect(JSON.stringify(failure.getResponse())).not.toContain(
        'ECONNREFUSED',
      );
    });
  });

  describe('writes', () => {
    it('005 AC-3: a write that fails with a token error is a 401 and is not retried', async () => {
      const db = fakeSupabase();
      db.answer('transactions', 'insert', { data: null, error: futureToken });

      await expect(
        service().create(db.client, 'user-1', dto),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(db.calls.filter((c) => c.operation === 'insert')).toHaveLength(1);
    });

    it('005 AC-3: a reclassification that fails with a token error is not retried', async () => {
      const db = fakeSupabase();
      db.answer('transactions', 'select', {
        data: { type: 'expense' },
        error: null,
      });
      db.answer('categories', 'select', {
        data: { applies_to: 'expense' },
        error: null,
      });
      db.answer('transactions', 'update', { data: null, error: futureToken });

      await expect(
        service().reclassify(db.client, 'tx-1', { categoryId: 'cat-food' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(db.calls.filter((c) => c.operation === 'update')).toHaveLength(1);
    });

    it.each([
      ['23505', ConflictException],
      ['23503', ConflictException],
      ['23514', BadRequestException],
      ['42501', ForbiddenException],
      ['TX001', BadRequestException],
      ['TX002', ForbiddenException],
    ])(
      '005 AC-4: a write rejected with %s is mapped, with a generic message',
      async (code, type) => {
        const db = fakeSupabase();
        db.answer('transactions', 'insert', {
          data: null,
          error: { code, message: 'raw message of the database' },
        });
        const failure = await service()
          .create(db.client, 'user-1', dto)
          .catch((e) => e);
        expect(failure).toBeInstanceOf(type);
        expect(JSON.stringify(failure.getResponse())).not.toContain(
          'raw message',
        );
      },
    );
  });

  describe('lookups', () => {
    it('005 AC-5: a failing lookup of the transaction becomes a mapped error', async () => {
      const db = fakeSupabase();
      db.answer('transactions', 'select', {
        data: null,
        error: { code: '42501', message: 'denied' },
      });
      await expect(
        service().reclassify(db.client, 'tx-1', { categoryId: 'cat-food' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('005 AC-5: a failing lookup of the category is no longer ignored', async () => {
      const db = fakeSupabase();
      db.answer('transactions', 'select', {
        data: { type: 'expense' },
        error: null,
      });
      db.answer('categories', 'select', {
        data: null,
        error: { code: 'XX000', message: 'boom' },
      });

      const failure = await service()
        .reclassify(db.client, 'tx-1', { categoryId: 'cat-food' })
        .catch((e) => e);
      expect(failure).toBeInstanceOf(InternalServerErrorException);
      expect(failure.getResponse().message).toBe(GENERIC_MESSAGES.internal);
      // The update is never attempted after a failed lookup.
      expect(db.calls.some((c) => c.operation === 'update')).toBe(false);
    });
  });
});
