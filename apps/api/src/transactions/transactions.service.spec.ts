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
