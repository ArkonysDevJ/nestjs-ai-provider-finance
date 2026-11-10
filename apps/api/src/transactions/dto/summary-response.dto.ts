// src/transactions/dto/summary-response.dto.ts
// [F-ID: SRC-TRANSACTIONS-DTO-SUMMARY-01]
// @version 1.2.0
// @changelog 1.2.0 — The totals are decimal strings with two places ("1234.50"),
//   computed by the database function get_transactions_summary, so the API does
//   no arithmetic on amounts. transactionCount stays a number.
// @changelog 1.1.0 — byCategory is now scoped to a single month
//   (selectedMonth), not an all-time total. Historical
//   category-vs-all-time totals were ambiguous once real usage
//   spans multiple months: a category's all-time sum keeps growing
//   and stops answering "how much did we spend on X this month".
//   byMonth is unaffected -- it's still the full historical series,
//   used as a trend reference alongside the single-month breakdown.
// @changelog 1.0.0 — Response shape for GET /transactions/summary.
//   Aggregation was computed in the service from the raw rows.

export interface CategorySummaryItem {
  categoryId: string;
  categoryName: string;
  totalExpense: string; // decimal text, two places
  totalIncome: string; // decimal text, two places
  transactionCount: number;
}

export interface MonthSummaryItem {
  month: string; // YYYY-MM
  totalExpense: string; // decimal text, two places
  totalIncome: string; // decimal text, two places
  transactionCount: number;
}

export interface SummaryResponse {
  selectedMonth: string; // YYYY-MM -- the month byCategory is scoped to
  byCategory: CategorySummaryItem[];
  byMonth: MonthSummaryItem[];
}
