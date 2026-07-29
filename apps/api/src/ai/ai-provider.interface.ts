// src/ai/ai-provider.interface.ts
// [F-ID: SRC-AI-INTERFACE-01]
// @version 1.1.0
// @changelog 1.1.0 — Category catalog split by transaction type.
//   Before this, CATEGORY_NAMES was a single flat list of 8
//   expense-shaped categories offered to the AI regardless of
//   whether the transaction was an expense or income -- a salary or
//   a refund had nothing real to classify into. EXPENSE_CATEGORY_NAMES
//   / INCOME_CATEGORY_NAMES + categoryNamesForType() mirror the
//   applies_to column added in supabase/migrations/003_category_types.sql.
//   "Otros" stays the universal fallback (applies_to = 'both' in the
//   DB), present in both lists here.
// @changelog 1.0.0 — Contract that both implementations (Gemini,
//   Local/MCP) must satisfy. This is the core of the pattern this
//   repo demonstrates: the domain doesn't know about the provider.

export const EXPENSE_CATEGORY_NAMES = [
  'Alimentación',
  'Transporte',
  'Vivienda',
  'Salud',
  'Entretenimiento',
  'Educación',
  'Ahorro/Inversión',
  'Otros',
] as const;

export const INCOME_CATEGORY_NAMES = [
  'Salario',
  'Ingreso extra',
  'Reembolso',
  'Otros',
] as const;

export type CategoryName =
  | (typeof EXPENSE_CATEGORY_NAMES)[number]
  | (typeof INCOME_CATEGORY_NAMES)[number];

export const FALLBACK_CATEGORY: CategoryName = 'Otros';

export type TransactionType = 'income' | 'expense';

/**
 * The category list a transaction's type is allowed to classify into.
 * Both implementations (Gemini, Local/MCP) must build their prompt
 * from this -- never from a hardcoded flat list -- so an income
 * transaction can never be offered "Vivienda" and vice versa.
 */
export function categoryNamesForType(
  type: TransactionType,
): readonly CategoryName[] {
  return type === 'income' ? INCOME_CATEGORY_NAMES : EXPENSE_CATEGORY_NAMES;
}

export interface ClassificationInput {
  description: string;
  amount: number;
  type: TransactionType;
}

export interface ClassificationResult {
  categoryName: CategoryName;
}

export type AiProviderName = 'gemini' | 'local';

/**
 * Single contract that GeminiProvider and LocalProvider satisfy.
 * The domain service (TransactionsService) depends only on this
 * interface -- never on a concrete SDK.
 */
export interface AIProvider {
  readonly providerName: AiProviderName;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
