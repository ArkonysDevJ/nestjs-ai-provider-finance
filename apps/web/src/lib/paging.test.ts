import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages, PAGE_SIZE } from './paging.ts';

function server(total: number) {
  const calls: Array<{ limit: number; offset: number }> = [];
  const rows = Array.from({ length: total }, (_, i) => i);
  return {
    calls,
    fetchPage: async (limit: number, offset: number) => {
      calls.push({ limit, offset });
      return rows.slice(offset, offset + limit);
    },
    rows,
  };
}

test('AC-6: the page size is the default limit of the API', () => {
  assert.equal(PAGE_SIZE, 100);
});

test('AC-6: a list shorter than a page is loaded with one request', async () => {
  const s = server(7);
  assert.deepEqual(await fetchAllPages(s.fetchPage), s.rows);
  assert.deepEqual(s.calls, [{ limit: 100, offset: 0 }]);
});

test('AC-6: every page is loaded, in order, until a page is shorter than the limit', async () => {
  const s = server(250);
  assert.deepEqual(await fetchAllPages(s.fetchPage), s.rows);
  assert.deepEqual(s.calls, [
    { limit: 100, offset: 0 },
    { limit: 100, offset: 100 },
    { limit: 100, offset: 200 },
  ]);
});

test('AC-6: a list that is an exact multiple of the limit needs one more request, which comes back empty', async () => {
  const s = server(200);
  assert.deepEqual(await fetchAllPages(s.fetchPage), s.rows);
  assert.equal(s.calls.length, 3);
  assert.deepEqual(s.calls[2], { limit: 100, offset: 200 });
});

test('AC-6: an empty list is an empty result', async () => {
  const s = server(0);
  assert.deepEqual(await fetchAllPages(s.fetchPage), []);
});

test('AC-6: a server that never returns a short page does not loop forever', async () => {
  await assert.rejects(
    fetchAllPages(async (limit) => Array.from({ length: limit }, () => 0)),
    /more than/,
  );
});
