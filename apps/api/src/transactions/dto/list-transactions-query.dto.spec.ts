import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DEFAULT_LIST_LIMIT,
  ListTransactionsQueryDto,
  MAX_LIST_LIMIT,
} from './list-transactions-query.dto.js';

async function check(query: Record<string, unknown>) {
  const dto = plainToInstance(ListTransactionsQueryDto, query);
  return { dto, errors: await validate(dto) };
}

describe('ListTransactionsQueryDto', () => {
  it('006 AC-4: without a query the limit is 100 and the offset is 0', async () => {
    const { dto, errors } = await check({});
    expect(errors).toEqual([]);
    expect(dto.limit).toBe(DEFAULT_LIST_LIMIT);
    expect(dto.offset).toBe(0);
    expect(MAX_LIST_LIMIT).toBe(200);
  });

  it.each([
    ['1', '0'],
    ['100', '50'],
    ['200', '1000'],
  ])(
    '006 AC-4: limit=%s and offset=%s are accepted and converted to numbers',
    async (limit, offset) => {
      const { dto, errors } = await check({ limit, offset });
      expect(errors).toEqual([]);
      expect(dto.limit).toBe(Number(limit));
      expect(dto.offset).toBe(Number(offset));
    },
  );

  it.each(['0', '201', '-1', '1.5', 'abc', ''])(
    '006 AC-4: limit=%p is rejected',
    async (limit) => {
      const { errors } = await check({ limit });
      expect(errors.map((e) => e.property)).toContain('limit');
    },
  );

  it.each(['-1', '1.5', 'abc'])(
    '006 AC-4: offset=%p is rejected',
    async (offset) => {
      const { errors } = await check({ offset });
      expect(errors.map((e) => e.property)).toContain('offset');
    },
  );
});
