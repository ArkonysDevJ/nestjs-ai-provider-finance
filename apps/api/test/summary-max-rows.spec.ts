// The summary must not depend on the row cap of the REST layer. This test runs
// against a local Supabase stack, so it is skipped unless SUPABASE_URL and
// SUPABASE_ANON_KEY point at one (the CI step "Summary row cap test" sets them).
// It never talks to anything but a loopback address.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_ANON_KEY ?? '';
const isLocal = /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(url);
const runnable = url !== '' && key !== '' && isLocal;

function configuredMaxRows(): number {
  const config = readFileSync(
    fileURLToPath(new URL('../../../supabase/config.toml', import.meta.url)),
    'utf8',
  );
  const match = config.match(/^max_rows\s*=\s*(\d+)/m);
  if (!match) throw new Error('max_rows is not set in supabase/config.toml');
  return Number(match[1]);
}

async function json<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

(runnable ? describe : describe.skip)(
  '006 AC-2: the summary is not truncated by the API row cap',
  () => {
    const timeout = 60_000;

    const maxRows = configuredMaxRows();
    const rows = maxRows + 100;
    const headers = (token: string) => ({
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
    let token = '';

    beforeAll(async () => {
      const email = `rowcap-${Date.now()}@example.com`;
      const password = 'rowcap-1234';
      const credentials = JSON.stringify({ email, password });
      await fetch(`${url}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: credentials,
      });
      const session = await json<{
        access_token: string;
        user: { id: string };
      }>(
        await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: credentials,
        }),
      );
      token = session.access_token;

      const [category] = await json<Array<{ id: string }>>(
        await fetch(`${url}/rest/v1/categories?name=eq.Otros&select=id`, {
          headers: headers(token),
        }),
      );
      const body = Array.from({ length: rows }, () => ({
        user_id: session.user.id,
        description: 'small',
        amount: 0.1,
        type: 'expense',
        category_id: category.id,
        occurred_at: '2026-03-15',
        classification_status: 'ai',
      }));
      await json<null>(
        await fetch(`${url}/rest/v1/transactions`, {
          method: 'POST',
          headers: { ...headers(token), Prefer: 'return=minimal' },
          body: JSON.stringify(body),
        }),
      );
    }, timeout);

    it(
      '006 AC-2: a plain read is cut at the row cap, which is why the summary cannot be computed from the rows',
      async () => {
        const read = await json<unknown[]>(
          await fetch(`${url}/rest/v1/transactions?select=id`, {
            headers: headers(token),
          }),
        );
        expect(read).toHaveLength(maxRows);
        expect(rows).toBeGreaterThan(maxRows);
      },
      timeout,
    );

    it(
      '006 AC-2: the summary function returns the exact totals for more rows than the cap',
      async () => {
        const summary = await json<{
          byMonth: unknown[];
          byCategory: Array<{ totalExpense: string; transactionCount: number }>;
        }>(
          await fetch(`${url}/rest/v1/rpc/get_transactions_summary`, {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({ p_month: '2026-03' }),
          }),
        );
        const expected = ((rows * 10) / 100).toFixed(2); // 0.10 each, no float sum
        expect(summary.byMonth).toEqual([
          {
            month: '2026-03',
            totalExpense: expected,
            totalIncome: '0.00',
            transactionCount: rows,
          },
        ]);
        expect(summary.byCategory).toHaveLength(1);
        expect(summary.byCategory[0].totalExpense).toBe(expected);
        expect(summary.byCategory[0].transactionCount).toBe(rows);
      },
      timeout,
    );
  },
);
