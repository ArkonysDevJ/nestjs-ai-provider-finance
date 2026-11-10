// src/lib/money.ts
// Amounts of money as decimal text, without floating point arithmetic.
//
// The API sends the totals as decimal strings ("1234.50"); an API deployed
// earlier sent numbers. Both are read into whole cents (an integer) and formatted
// back with two places, so no sum or product of decimals is ever computed.

const DECIMAL = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** Reads a number or a decimal string into whole cents. */
export function toCents(value: number | string): number {
  // A number is turned into text with two places first. It is already a value
  // with at most two decimals (numeric(12,2) on the server), so this does not add.
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const match = DECIMAL.exec(text);
  if (!match) {
    throw new TypeError(`Not an amount with at most two decimals: "${text}"`);
  }
  const [, sign, whole, fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Amount out of range: "${text}"`);
  }
  return sign === '-' ? -cents : cents;
}

/** Formats a number or a decimal string with two places, for example "1234.50". */
export function formatMoney(value: number | string): string {
  const cents = toCents(value);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}
