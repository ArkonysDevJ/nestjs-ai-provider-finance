import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { startFakeMcpServer } = require('./fake-mcp-server.cjs') as {
  startFakeMcpServer: (options?: { host?: string; port?: number }) => Promise<{
    host: string;
    port: number;
    url: string;
    close: () => Promise<void>;
  }>;
};

async function classifyThroughMcp(
  url: string,
  description: string,
  type: string,
) {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  try {
    const result = await client.callTool({
      name: 'classify_transaction',
      arguments: { description, amount: 10, type },
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    return content.find((block) => block.type === 'text')?.text;
  } finally {
    await client.close();
  }
}

describe('AC-8: the fake MCP server', () => {
  let started: Awaited<ReturnType<typeof startFakeMcpServer>>;

  beforeAll(async () => {
    started = await startFakeMcpServer({ host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await started.close();
  });

  it('AC-8: listens only on loopback', () => {
    expect(started.host).toBe('127.0.0.1');
  });

  it('AC-8: refuses to listen on a non-loopback address', async () => {
    await expect(
      startFakeMcpServer({ host: '0.0.0.0', port: 0 }),
    ).rejects.toThrow('loopback');
  });

  it('AC-8: answers the classification tool deterministically', async () => {
    const first = await classifyThroughMcp(
      started.url,
      'Taxi al aeropuerto',
      'expense',
    );
    const second = await classifyThroughMcp(
      started.url,
      'Taxi al aeropuerto',
      'expense',
    );
    expect(first).toBe('Transporte');
    expect(second).toBe(first);
    expect(
      await classifyThroughMcp(started.url, 'Sueldo de noviembre', 'income'),
    ).toBe('Salario');
    expect(
      await classifyThroughMcp(
        started.url,
        'Algo sin palabras clave',
        'expense',
      ),
    ).toBe('Otros');
  });
});
