import { LOCAL_MODEL_LABEL, LocalProvider } from './local.provider.js';
import type { LocalClassifierClient } from './ai-provider.interface.js';

interface Request {
  description: string;
  amount: number;
  type: 'income' | 'expense';
  timeoutMs: number;
  signal: AbortSignal;
}

function fakeClient(classify: (request: Request) => Promise<{ text: string }>) {
  const requests: Request[] = [];
  let closed = 0;
  const client: LocalClassifierClient = {
    classify: (request) => {
      requests.push(request);
      return classify(request);
    },
    close: async () => {
      closed += 1;
    },
  };
  return { client, requests, closedCount: () => closed };
}

function provider(client: LocalClassifierClient, timeoutMs = 50) {
  return new LocalProvider(client, { timeoutMs });
}

const input = {
  description: 'Bus ticket',
  amount: 3,
  type: 'expense' as const,
};

describe('LocalProvider', () => {
  it('AC-1: an exact category is a classification, with the local model label', async () => {
    const { client } = fakeClient(async () => ({ text: 'Transporte' }));
    await expect(provider(client).classify(input)).resolves.toEqual({
      status: 'ai',
      categoryName: 'Transporte',
      model: LOCAL_MODEL_LABEL,
    });
  });

  it('AC-1: a category with different case or surrounding whitespace is accepted', async () => {
    const { client } = fakeClient(async () => ({ text: ' transporte ' }));
    await expect(provider(client).classify(input)).resolves.toMatchObject({
      status: 'ai',
      categoryName: 'Transporte',
    });
  });

  it('AC-1: the request carries the description, the amount and the type', async () => {
    const { client, requests } = fakeClient(async () => ({
      text: 'Transporte',
    }));
    await provider(client).classify(input);
    expect(requests[0]).toMatchObject({
      description: 'Bus ticket',
      amount: 3,
      type: 'expense',
    });
  });

  it('AC-2: unrecognized text is a fallback with invalid_output', async () => {
    const { client } = fakeClient(async () => ({ text: 'something else' }));
    await expect(provider(client).classify(input)).resolves.toEqual({
      status: 'fallback',
      categoryName: 'Otros',
      reason: 'invalid_output',
      model: LOCAL_MODEL_LABEL,
    });
  });

  it('AC-2: a category of the other type is invalid_output', async () => {
    const { client } = fakeClient(async () => ({ text: 'Salario' }));
    await expect(provider(client).classify(input)).resolves.toMatchObject({
      reason: 'invalid_output',
    });
  });

  it('AC-3: a tool error is provider_error', async () => {
    const { client } = fakeClient(async () => {
      throw new Error(
        'classify_transaction tool returned an error: model not found',
      );
    });
    await expect(provider(client).classify(input)).resolves.toMatchObject({
      status: 'fallback',
      reason: 'provider_error',
    });
  });

  it('AC-3: an HTTP 429 from the server is quota_exceeded', async () => {
    const { client } = fakeClient(async () => {
      throw Object.assign(new Error('rate limited'), { status: 429 });
    });
    await expect(provider(client).classify(input)).resolves.toMatchObject({
      reason: 'quota_exceeded',
    });
  });

  it('AC-3: an MCP request timeout (JSON-RPC code -32001) is timeout', async () => {
    const { client } = fakeClient(async () => {
      throw Object.assign(new Error('Request timed out'), { code: -32001 });
    });
    await expect(provider(client).classify(input)).resolves.toMatchObject({
      reason: 'timeout',
    });
  });

  it('AC-3: a call that exceeds its timeout is timeout, and the request is aborted', async () => {
    const { client, requests } = fakeClient(() => new Promise(() => undefined));
    await expect(provider(client, 20).classify(input)).resolves.toMatchObject({
      reason: 'timeout',
    });
    expect(requests[0].signal.aborted).toBe(true);
  });

  it('AC-3: no provider error escapes as an exception', async () => {
    const { client } = fakeClient(() => Promise.reject(new Error('down')));
    await expect(provider(client).classify(input)).resolves.toBeDefined();
  });

  it('AC-4: the configured timeout is passed to the client', async () => {
    const { client, requests } = fakeClient(async () => ({
      text: 'Transporte',
    }));
    await provider(client, 777).classify(input);
    expect(requests[0].timeoutMs).toBe(777);
  });

  it('closes the client when the module is destroyed', async () => {
    const { client, closedCount } = fakeClient(async () => ({
      text: 'Transporte',
    }));
    await provider(client).onModuleDestroy();
    expect(closedCount()).toBe(1);
  });
});
