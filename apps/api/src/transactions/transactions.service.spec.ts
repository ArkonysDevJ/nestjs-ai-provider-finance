import { TransactionsService } from './transactions.service.js';
import type {
  AIProvider,
  ClassificationResult,
} from '../ai/ai-provider.interface.js';
import type { CategoriesService } from '../categories/categories.service.js';
import { fakeSupabase } from '../../test/support/fake-supabase.js';

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
