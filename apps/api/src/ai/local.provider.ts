// src/ai/local.provider.ts
// [F-ID: SRC-AI-LOCAL-PROVIDER-01]
// @version 2.1.0
// @changelog 2.1.0 — parseCategory() validates against
//   categoryNamesForType(input.type) instead of a single flat
//   CATEGORY_NAMES list, mirroring the applies_to split. The MCP
//   server (finance-classifier-mcp/server.py) already receives
//   `type` and mirrors the same split -- this is the client-side
//   half of that contract, same zero-trust-in-the-model stance as
//   GeminiProvider.
// @changelog 2.0.0 — Rewritten to speak real MCP (streamable-http via
//   @modelcontextprotocol/sdk), not a plain REST POST like v1. The
//   local server (finance-classifier-mcp/, at the repo root) exposes
//   a real classify_transaction tool. Lazy singleton connection: the
//   MCP client connects once and is reused across requests; if a call
//   fails, the connection is discarded to force a clean reconnect on
//   the next attempt instead of reusing a possibly dead transport.
// @changelog 1.0.0 — Development implementation of AIProvider via a
//   plain REST POST (superseded by v2.0.0 -- real MCP, not REST).

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  AIProvider,
  categoryNamesForType,
  CategoryName,
  ClassificationInput,
  ClassificationResult,
  FALLBACK_CATEGORY,
} from './ai-provider.interface';

interface McpTextContent {
  type: string;
  text?: string;
}

@Injectable()
export class LocalProvider implements AIProvider, OnModuleDestroy {
  readonly providerName = 'local' as const;

  private readonly logger = new Logger(LocalProvider.name);
  private readonly endpoint: string;
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly configService: ConfigService) {
    // Streamable-http MCP server URL, e.g.:
    // http://localhost:8765/mcp -- NOT a REST endpoint.
    this.endpoint = this.configService.getOrThrow<string>(
      'LOCAL_AI_ENDPOINT',
    );
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    try {
      const client = await this.getClient();

      const result = await client.callTool({
        name: 'classify_transaction',
        arguments: {
          description: input.description,
          amount: input.amount,
          type: input.type,
        },
      });

      if (result.isError) {
        throw new Error(
          `classify_transaction tool returned an error: ${this.extractText(result.content as McpTextContent[])}`,
        );
      }

      const rawText = this.extractText(result.content as McpTextContent[]);
      return { categoryName: this.parseCategory(rawText, input.type) };
    } catch (error) {
      this.logger.warn(
        `Local provider (MCP) classification failed, falling back to "${FALLBACK_CATEGORY}": ${(error as Error).message}`,
      );
      // Possibly dead transport (server down, network, etc.) --
      // discarded to reconnect cleanly on the next attempt instead
      // of continuing to reuse something broken.
      this.client = null;
      this.connecting = null;
      return { categoryName: FALLBACK_CATEGORY };
    }
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
    const transport = new StreamableHTTPClientTransport(
      new URL(this.endpoint),
    );
    const client = new Client({
      name: 'nestjs-ai-provider-finance',
      version: '1.0.0',
    });
    await client.connect(transport);
    this.logger.log(`Connected to the local MCP server at ${this.endpoint}`);
    return client;
  }

  private extractText(content: McpTextContent[] | undefined): string {
    const textBlock = content?.find((block) => block.type === 'text');
    return textBlock?.text?.trim() ?? '';
  }

  private parseCategory(
    raw: string,
    type: ClassificationInput['type'],
  ): CategoryName {
    const match = categoryNamesForType(type).find(
      (name) => name.toLowerCase() === raw.trim().toLowerCase(),
    );
    return match ?? FALLBACK_CATEGORY;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }
}
