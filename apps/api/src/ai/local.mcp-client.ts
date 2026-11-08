// Transport adapter of the local provider: it talks MCP to the local
// classifier server and returns the text, or lets the raw error propagate. The
// SDK is a development dependency, so it is imported only when this client
// connects, and a production image without dev dependencies never loads it.
// The connection is reused; after a failure it is discarded, so the next call
// reconnects instead of reusing a possibly dead transport.

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  LocalClassifierClient,
  TransactionType,
} from './ai-provider.interface.js';

interface McpTextContent {
  type: string;
  text?: string;
}

export class McpClassifierClient implements LocalClassifierClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly endpoint: string) {}

  async classify(request: {
    description: string;
    amount: number;
    type: TransactionType;
    timeoutMs: number;
    signal: AbortSignal;
  }): Promise<{ text: string }> {
    try {
      const client = await this.getClient();
      const result = await client.callTool(
        {
          name: 'classify_transaction',
          arguments: {
            description: request.description,
            amount: request.amount,
            type: request.type,
          },
        },
        undefined,
        { timeout: request.timeoutMs, signal: request.signal },
      );

      const content = result.content as McpTextContent[] | undefined;
      const text =
        content?.find((block) => block.type === 'text')?.text?.trim() ?? '';
      if (result.isError) {
        throw new Error(`classify_transaction tool returned an error: ${text}`);
      }
      return { text };
    } catch (error) {
      this.client = null;
      this.connecting = null;
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.client?.close();
  }

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = this.connect();
    }
    this.client = await this.connecting;
    return this.client;
  }

  private async connect(): Promise<Client> {
    const [{ Client: McpClient }, { StreamableHTTPClientTransport }] =
      await Promise.all([
        import('@modelcontextprotocol/sdk/client/index.js'),
        import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
      ]);
    const transport = new StreamableHTTPClientTransport(new URL(this.endpoint));
    const client = new McpClient({
      name: 'nestjs-ai-provider-finance',
      version: '1.0.0',
    });
    await client.connect(transport);
    return client;
  }
}
