import {
  EXPENSE_CATEGORY_NAMES,
  FALLBACK_CATEGORY,
  categoryNamesForType,
} from '../src/ai/ai-provider.interface';

describe('AC-1: the test suite runs from a clean clone', () => {
  it('AC-1: runs with no environment variables and no network', () => {
    expect(categoryNamesForType('expense')).toBe(EXPENSE_CATEGORY_NAMES);
    expect(categoryNamesForType('income')).toContain(FALLBACK_CATEGORY);
  });
});
