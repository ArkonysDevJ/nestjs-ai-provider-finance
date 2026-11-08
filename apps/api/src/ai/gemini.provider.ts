// src/ai/gemini.provider.ts
// [F-ID: SRC-AI-GEMINI-PROVIDER-01]
// @version 2.0.0
// @changelog 2.0.0 — Rewritten against a narrow GeminiClient (one `generate`
//   call), so the provider is tested without the SDK. A failure is no longer
//   a silent "Otros": the result says whether it is a real classification or
//   a fallback, and why (provider_error, timeout, quota_exceeded,
//   invalid_output). The call has an explicit timeout and the model is the
//   one configured, never a "-latest" alias.
// @changelog 1.1.0 — Prompt and parsing now scoped to the
//   transaction's type via categoryNamesForType() instead of a
//   single flat CATEGORY_NAMES list -- an income transaction is
//   offered Salario/Ingreso extra/Reembolso/Otros, never the expense
//   categories, and vice versa. See ai-provider.interface.ts.
// @changelog 1.0.1 — "gemini-1.5-flash" retired by Google (404
//   confirmed in a real test via Bruno, 2026-07-29).
// @changelog 1.0.0 — Production implementation of AIProvider on
//   top of the Google Gemini API. Zero structural trust in an LLM's
//   payload: always validate, never assume it's well-formed.

import { Logger } from '@nestjs/common';
import {
  AIProvider,
  categoryNamesForType,
  ClassificationInput,
  ClassificationResult,
  FALLBACK_CATEGORY,
  GeminiClient,
} from './ai-provider.interface.js';
import {
  callWithTimeout,
  classifyFailure,
  fallback,
  parseCategory,
} from './classification.js';

export interface GeminiProviderOptions {
  /** The model requested. It is recorded as is in a fallback. */
  model: string;
  timeoutMs: number;
}

export class GeminiProvider implements AIProvider {
  readonly providerName = 'gemini' as const;

  private readonly logger = new Logger(GeminiProvider.name);

  constructor(
    private readonly client: GeminiClient,
    private readonly options: GeminiProviderOptions,
  ) {}

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const { model: requestedModel, timeoutMs } = this.options;
    try {
      const reply = await callWithTimeout(timeoutMs, (signal) =>
        this.client.generate({
          prompt: this.buildPrompt(input),
          timeoutMs,
          signal,
        }),
      );

      const categoryName = parseCategory(reply.text, input.type);
      if (!categoryName) {
        this.logger.warn(
          `Gemini classification failed (reason=invalid_output), falling back to "${FALLBACK_CATEGORY}".`,
        );
        return fallback('invalid_output', requestedModel);
      }

      return {
        status: 'ai',
        categoryName,
        model: reply.model?.trim() || requestedModel,
      };
    } catch (error) {
      const reason = classifyFailure(error);
      this.logger.warn(
        `Gemini classification failed (reason=${reason}), falling back to "${FALLBACK_CATEGORY}": ${(error as Error)?.message ?? 'unknown error'}`,
      );
      return fallback(reason, requestedModel);
    }
  }

  private buildPrompt(input: ClassificationInput): string {
    return [
      'Classify the following financial transaction into EXACTLY one of these categories:',
      categoryNamesForType(input.type).join(', '),
      '',
      `Description: ${input.description}`,
      `Amount: ${input.amount}`,
      `Type: ${input.type}`,
      '',
      'Respond ONLY with the exact category name, no additional explanation.',
    ].join('\n');
  }
}
