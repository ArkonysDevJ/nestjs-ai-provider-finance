// Shared pieces of the providers: the exact-match parser of a model answer,
// the timeout wrapper and the mapping of a provider error to a fallback
// reason. Kept apart from the providers so that each rule has one definition.

import {
  CategoryName,
  categoryNamesForType,
  ClassificationResult,
  FALLBACK_CATEGORY,
  FallbackReason,
  TransactionType,
} from './ai-provider.interface.js';

/** Thrown by `callWithTimeout` when the call exceeds its time limit. */
export class ProviderTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`The provider call exceeded ${timeoutMs} ms.`);
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * Runs `run` with a time limit. On expiry the signal is aborted, so a client
 * that honours it can cancel its request, and the call fails with
 * `ProviderTimeoutError` even if the client ignores the signal.
 */
export async function callWithTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), expiry]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The category named by a model answer, or null. Only an exact name of the
 * allowed list for the type is accepted, ignoring case and surrounding
 * whitespace: anything else, including a category of the other type, is
 * not a classification.
 */
export function parseCategory(
  rawText: string,
  type: TransactionType,
): CategoryName | null {
  const normalized = rawText.trim().toLowerCase();
  return (
    categoryNamesForType(type).find(
      (name) => name.toLowerCase() === normalized,
    ) ?? null
  );
}

// JSON-RPC code of a request that timed out in the MCP client.
const MCP_REQUEST_TIMEOUT = -32001;

function numericField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Maps a provider error to a fallback reason. It looks at an HTTP status
 * first, then at the SDK error code, then at the error name for timeouts.
 */
export function classifyFailure(error: unknown): FallbackReason {
  if (error instanceof ProviderTimeoutError) return 'timeout';

  const e = (error ?? {}) as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    response?: { status?: unknown };
  };

  const httpStatus =
    numericField(e.status) ??
    numericField(e.statusCode) ??
    numericField(e.response?.status);
  if (httpStatus === 402 || httpStatus === 429) return 'quota_exceeded';

  const textCodes = [e.status, e.code]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.toUpperCase());
  const message = typeof e.message === 'string' ? e.message : '';
  if (
    textCodes.includes('RESOURCE_EXHAUSTED') ||
    message.includes('RESOURCE_EXHAUSTED')
  ) {
    return 'quota_exceeded';
  }

  if (
    numericField(e.code) === MCP_REQUEST_TIMEOUT ||
    e.name === 'TimeoutError' ||
    e.name === 'AbortError' ||
    textCodes.includes('ETIMEDOUT')
  ) {
    return 'timeout';
  }

  return 'provider_error';
}

export function fallback(
  reason: FallbackReason,
  model: string,
): ClassificationResult {
  return {
    status: 'fallback',
    categoryName: FALLBACK_CATEGORY,
    reason,
    model,
  };
}
