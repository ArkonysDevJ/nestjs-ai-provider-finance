import { isFutureTokenError } from './map-error.js';

const DEFAULT_DELAY_MS = 250;

/**
 * Runs a read and, if the REST layer refuses the token because it was issued a
 * moment ahead of its own clock, runs it once more after a short delay. Only
 * reads go through here: a write that failed with a token error is never
 * retried, because it may already have happened.
 */
export async function readWithRetry<T extends { error: unknown }>(
  run: () => PromiseLike<T>,
  delayMs = DEFAULT_DELAY_MS,
): Promise<T> {
  const first = await run();
  if (!isFutureTokenError(first.error)) return first;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return run();
}
