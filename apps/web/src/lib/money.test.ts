import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, toCents } from './money.ts';

test('AC-5: a decimal string is formatted with two places, as it is', () => {
  assert.equal(formatMoney('1234.50'), '1234.50');
  assert.equal(formatMoney('0.10'), '0.10');
  assert.equal(formatMoney('9999999999.99'), '9999999999.99');
});

test('AC-5: a number from an API deployed earlier is formatted the same way', () => {
  assert.equal(formatMoney(1234.5), '1234.50');
  assert.equal(formatMoney(120), '120.00');
  assert.equal(formatMoney(0.1), '0.10');
});

test('AC-5: a string and the number of the same amount give the same text', () => {
  assert.equal(formatMoney('35.00'), formatMoney(35));
  assert.equal(formatMoney('202.00'), formatMoney(202));
});

test('AC-5: text with one decimal or none is padded to two places', () => {
  assert.equal(formatMoney('5'), '5.00');
  assert.equal(formatMoney('5.5'), '5.50');
});

test('AC-5: the amounts are read as whole cents, so no float sum is needed', () => {
  assert.equal(toCents('0.10'), 10);
  assert.equal(toCents('1234.50'), 123450);
  // A float sum of these gives 0.30000000000000004; cents add exactly.
  assert.equal(toCents('0.10') + toCents('0.20'), toCents('0.30'));
  // 1200 amounts of 0.10 add up to exactly 120.00 in cents.
  assert.equal(
    formatMoney(
      Array.from({ length: 1200 }, () => toCents('0.10')).reduce(
        (a, b) => a + b,
        0,
      ) / 100,
    ),
    '120.00',
  );
});

test('AC-5: a negative amount keeps its sign', () => {
  assert.equal(formatMoney('-5.5'), '-5.50');
  assert.equal(toCents('-0.05'), -5);
});

test('AC-5: text that is not an amount with at most two decimals is rejected', () => {
  for (const bad of ['', 'abc', '1.234', '1,50', '1e3', ' ']) {
    assert.throws(() => toCents(bad), TypeError, bad);
  }
});
