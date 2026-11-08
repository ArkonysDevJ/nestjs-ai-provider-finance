import { ApiError } from '@google/genai';
import { GeminiProvider } from './gemini.provider.js';
import type { GeminiClient } from './ai-provider.interface.js';

const REQUESTED_MODEL = 'model-under-test';

interface Request {
  prompt: string;
  timeoutMs: number;
  signal: AbortSignal;
}

function fakeClient(
  generate: (request: Request) => Promise<{ text: string; model?: string }>,
) {
  const requests: Request[] = [];
  const client: GeminiClient = {
    generate: (request) => {
      requests.push(request);
      return generate(request);
    },
  };
  return { client, requests };
}

function provider(client: GeminiClient, timeoutMs = 50) {
  return new GeminiProvider(client, { model: REQUESTED_MODEL, timeoutMs });
}

const input = {
  description: 'Weekly groceries',
  amount: 42,
  type: 'expense' as const,
};

describe('GeminiProvider', () => {
  describe('a real answer', () => {
    it('AC-1: an exact category is a classification with the category and the serving model', async () => {
      const { client } = fakeClient(async () => ({
        text: 'Alimentación',
        model: 'served-model',
      }));
      await expect(provider(client).classify(input)).resolves.toEqual({
        status: 'ai',
        categoryName: 'Alimentación',
        model: 'served-model',
      });
    });

    it('AC-1: the requested model is recorded when the SDK does not expose the serving model', async () => {
      const { client } = fakeClient(async () => ({ text: 'Transporte' }));
      await expect(provider(client).classify(input)).resolves.toMatchObject({
        status: 'ai',
        model: REQUESTED_MODEL,
      });
    });

    it('AC-1: a category with different case or surrounding whitespace is accepted', async () => {
      const { client } = fakeClient(async () => ({
        text: '  aLiMeNtAcIóN \n',
      }));
      await expect(provider(client).classify(input)).resolves.toMatchObject({
        status: 'ai',
        categoryName: 'Alimentación',
      });
    });

    it('AC-1: a real answer of "Otros" is a classification, not a fallback', async () => {
      const { client } = fakeClient(async () => ({ text: 'Otros' }));
      await expect(provider(client).classify(input)).resolves.toMatchObject({
        status: 'ai',
        categoryName: 'Otros',
      });
    });

    it('AC-1: the prompt offers the categories of the transaction type only', async () => {
      const { client, requests } = fakeClient(async () => ({
        text: 'Salario',
      }));
      await provider(client).classify({
        description: 'Monthly pay',
        amount: 1000,
        type: 'income',
      });
      expect(requests[0].prompt).toContain('Salario');
      expect(requests[0].prompt).not.toContain('Vivienda');
    });
  });

  describe('an answer that is not a category', () => {
    it.each([
      ['unrecognized text', 'I think it is groceries'],
      ['an empty answer', ''],
      ['a category with extra punctuation', 'Alimentación.'],
      ['two categories', 'Alimentación, Transporte'],
      ['a category of the other type', 'Salario'],
    ])('AC-2: %s is a fallback with invalid_output', async (_label, text) => {
      const { client } = fakeClient(async () => ({
        text,
        model: 'served-model',
      }));
      await expect(provider(client).classify(input)).resolves.toEqual({
        status: 'fallback',
        categoryName: 'Otros',
        reason: 'invalid_output',
        model: REQUESTED_MODEL,
      });
    });
  });

  describe('failures', () => {
    const failing = (error: unknown) =>
      fakeClient(async () => Promise.reject(error)).client;

    it('AC-3: an HTTP 402 is quota_exceeded', async () => {
      const error = new ApiError({
        message: 'prepayment credits are depleted',
        status: 402,
      });
      await expect(provider(failing(error)).classify(input)).resolves.toEqual({
        status: 'fallback',
        categoryName: 'Otros',
        reason: 'quota_exceeded',
        model: REQUESTED_MODEL,
      });
    });

    it('AC-3: an HTTP 429 is quota_exceeded', async () => {
      const error = new ApiError({ message: 'too many requests', status: 429 });
      await expect(
        provider(failing(error)).classify(input),
      ).resolves.toMatchObject({
        reason: 'quota_exceeded',
      });
    });

    it('AC-3: RESOURCE_EXHAUSTED without a numeric status is quota_exceeded', async () => {
      const error = Object.assign(
        new Error('{"error":{"status":"RESOURCE_EXHAUSTED"}}'),
        {
          status: 'RESOURCE_EXHAUSTED',
        },
      );
      await expect(
        provider(failing(error)).classify(input),
      ).resolves.toMatchObject({
        reason: 'quota_exceeded',
      });
    });

    it('AC-3: a call that exceeds its timeout is timeout, and the request is aborted', async () => {
      const { client, requests } = fakeClient(
        () => new Promise(() => undefined),
      );
      await expect(provider(client, 20).classify(input)).resolves.toEqual({
        status: 'fallback',
        categoryName: 'Otros',
        reason: 'timeout',
        model: REQUESTED_MODEL,
      });
      expect(requests[0].signal.aborted).toBe(true);
    });

    it('AC-3: an error named TimeoutError is timeout', async () => {
      const error = Object.assign(new Error('signal timed out'), {
        name: 'TimeoutError',
      });
      await expect(
        provider(failing(error)).classify(input),
      ).resolves.toMatchObject({
        reason: 'timeout',
      });
    });

    it.each([
      ['an HTTP 500', new ApiError({ message: 'internal', status: 500 })],
      ['a network error', new TypeError('fetch failed')],
      ['a thrown string', 'boom'],
      ['an undefined rejection', undefined],
    ])('AC-3: %s is provider_error', async (_label, error) => {
      await expect(
        provider(failing(error)).classify(input),
      ).resolves.toMatchObject({
        status: 'fallback',
        reason: 'provider_error',
        model: REQUESTED_MODEL,
      });
    });

    it('AC-3: no provider error escapes as an exception', async () => {
      await expect(
        provider(failing(new Error('anything'))).classify(input),
      ).resolves.toBeDefined();
    });
  });

  describe('timeout', () => {
    it('AC-4: the configured timeout is passed to the client', async () => {
      const { client, requests } = fakeClient(async () => ({
        text: 'Transporte',
      }));
      await provider(client, 1234).classify(input);
      expect(requests[0].timeoutMs).toBe(1234);
    });
  });
});
