// A small stand-in for the Supabase query builder, for service tests. It records
// every write and answers each call from a queue per table and operation. It is
// not a database: it only lets a test see what a service sends and how it reacts
// to a given answer.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface Answer {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface Call {
  table: string;
  operation: 'select' | 'insert' | 'update';
  payload?: Record<string, unknown>;
}

export interface FakeSupabase {
  client: SupabaseClient;
  calls: Call[];
  /** Queues the answer for the next call of this table and operation. */
  answer(table: string, operation: Call['operation'], answer: Answer): void;
}

export function fakeSupabase(): FakeSupabase {
  const calls: Call[] = [];
  const queues = new Map<string, Answer[]>();

  const next = (table: string, operation: string): Answer => {
    const queue = queues.get(`${table}:${operation}`) ?? [];
    const answer = queue.shift();
    if (!answer) {
      throw new Error(`No answer queued for ${table}:${operation}`);
    }
    return answer;
  };

  const query = (table: string) => {
    let operation: Call['operation'] = 'select';
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: (payload: Record<string, unknown>) => {
        operation = 'insert';
        calls.push({ table, operation, payload });
        return builder;
      },
      update: (payload: Record<string, unknown>) => {
        operation = 'update';
        calls.push({ table, operation, payload });
        return builder;
      },
      single: () => Promise.resolve(next(table, operation)),
      maybeSingle: () => Promise.resolve(next(table, operation)),
      then: (
        resolve: (value: Answer) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(next(table, operation)).then(resolve, reject),
    };
    if (operation === 'select') calls.push({ table, operation });
    return builder;
  };

  return {
    client: {
      from: (table: string) => query(table),
    } as unknown as SupabaseClient,
    calls,
    answer(table, operation, answer) {
      const key = `${table}:${operation}`;
      queues.set(key, [...(queues.get(key) ?? []), answer]);
    },
  };
}
