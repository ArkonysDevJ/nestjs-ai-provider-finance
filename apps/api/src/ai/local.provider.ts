// src/ai/local.provider.ts
// [F-ID: SRC-AI-LOCAL-PROVIDER-01]
// @version 3.0.0
// @changelog 3.0.0 — Rewritten against a narrow LocalClassifierClient, so the
//   provider is tested without the MCP SDK, which is now a development
//   dependency and is loaded lazily by the adapter (local.mcp-client.ts). The
//   result says whether the answer is a real classification or a fallback,
//   and why. The call has an explicit timeout.
// @changelog 2.1.0 — parseCategory() validates against
//   categoryNamesForType(input.type) instead of a single flat
//   CATEGORY_NAMES list, mirroring the applies_to split.
// @changelog 2.0.0 — Rewritten to speak real MCP (streamable-http via
//   @modelcontextprotocol/sdk), not a plain REST POST like v1.
// @changelog 1.0.0 — Development implementation of AIProvider via a
//   plain REST POST (superseded by v2.0.0 -- real MCP, not REST).

import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  AIProvider,
  ClassificationInput,
  ClassificationResult,
  FALLBACK_CATEGORY,
  LocalClassifierClient,
} from './ai-provider.interface.js';
import {
  callWithTimeout,
  classifyFailure,
  fallback,
  parseCategory,
} from './classification.js';

/** The local provider has no configurable model: the label says which one it is. */
export const LOCAL_MODEL_LABEL = 'local-mcp';

export class LocalProvider implements AIProvider, OnModuleDestroy {
  readonly providerName = 'local' as const;

  private readonly logger = new Logger(LocalProvider.name);

  constructor(
    private readonly client: LocalClassifierClient,
    private readonly options: { timeoutMs: number },
  ) {}

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const { timeoutMs } = this.options;
    try {
      const reply = await callWithTimeout(timeoutMs, (signal) =>
        this.client.classify({
          description: input.description,
          amount: input.amount,
          type: input.type,
          timeoutMs,
          signal,
        }),
      );

      const categoryName = parseCategory(reply.text, input.type);
      if (!categoryName) {
        this.logger.warn(
          `Local classification failed (reason=invalid_output), falling back to "${FALLBACK_CATEGORY}".`,
        );
        return fallback('invalid_output', LOCAL_MODEL_LABEL);
      }
      return { status: 'ai', categoryName, model: LOCAL_MODEL_LABEL };
    } catch (error) {
      const reason = classifyFailure(error);
      this.logger.warn(
        `Local classification failed (reason=${reason}), falling back to "${FALLBACK_CATEGORY}": ${(error as Error)?.message ?? 'unknown error'}`,
      );
      return fallback(reason, LOCAL_MODEL_LABEL);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close?.();
  }
}
