import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { fakeSupabase } from '../../test/support/fake-supabase.js';

describe('CategoriesService', () => {
  it('005 AC-5: a failing query is a mapped error, not the raw error object', async () => {
    const db = fakeSupabase();
    db.answer('categories', 'select', {
      data: null,
      error: { code: 'XX000', message: 'raw backend text' },
    });
    const failure = await new CategoriesService()
      .findAll(db.client)
      .catch((e) => e);
    expect(failure).toBeInstanceOf(InternalServerErrorException);
    expect(JSON.stringify(failure.getResponse())).not.toContain(
      'raw backend text',
    );
  });

  it('005 AC-3: a token issued in the future is retried once', async () => {
    const db = fakeSupabase();
    db.answer('categories', 'select', {
      data: null,
      error: { code: 'PGRST303', message: 'JWT issued at future' },
    });
    db.answer('categories', 'select', {
      data: [{ id: 'c1', name: 'Otros' }],
      error: null,
    });
    await expect(new CategoriesService().findAll(db.client)).resolves.toEqual([
      { id: 'c1', name: 'Otros' },
    ]);
  });

  it('005 AC-3: a token error that persists is a 401', async () => {
    const db = fakeSupabase();
    const error = { code: 'PGRST301', message: 'JWT invalid' };
    db.answer('categories', 'select', { data: null, error });
    await expect(
      new CategoriesService().findAll(db.client),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
