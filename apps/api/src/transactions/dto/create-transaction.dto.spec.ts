import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto, MAX_AMOUNT } from './create-transaction.dto.js';

async function errorsFor(amount: unknown) {
  const dto = plainToInstance(CreateTransactionDto, {
    description: 'Coffee',
    amount,
    type: 'expense',
  });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'amount');
}

describe('CreateTransactionDto amount', () => {
  it('AC-1: the bound is the largest value of numeric(12,2)', () => {
    expect(MAX_AMOUNT).toBe(9_999_999_999.99);
  });

  it.each([0.01, 1, 12.5, 100.99, 9_999_999_999.99])(
    'AC-1: %s is accepted',
    async (amount) => {
      expect(await errorsFor(amount)).toEqual([]);
    },
  );

  it.each([10_000_000_000, 99_999_999_999.99, Number.MAX_SAFE_INTEGER])(
    'AC-1: %s is above the bound and is rejected',
    async (amount) => {
      const errors = await errorsFor(amount);
      expect(errors).toHaveLength(1);
      expect(Object.keys(errors[0].constraints ?? {})).toContain('max');
    },
  );

  it.each([12.345, 0.001, 1.999])(
    'AC-1: %s has more than two decimals and is rejected',
    async (amount) => {
      const errors = await errorsFor(amount);
      expect(errors).toHaveLength(1);
      expect(Object.keys(errors[0].constraints ?? {})).toContain('isNumber');
    },
  );

  it.each([
    0,
    -1,
    -0.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '12.50',
    null,
    undefined,
  ])('AC-1: %p is rejected', async (amount) => {
    expect((await errorsFor(amount)).length).toBeGreaterThan(0);
  });
});
