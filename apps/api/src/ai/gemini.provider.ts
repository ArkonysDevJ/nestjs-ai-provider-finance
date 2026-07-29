// src/ai/gemini.provider.ts
// [F-ID: SRC-AI-GEMINI-PROVIDER-01]
// @version 1.1.0
// @changelog 1.1.0 — Prompt and parsing now scoped to the
//   transaction's type via categoryNamesForType() instead of a
//   single flat CATEGORY_NAMES list -- an income transaction is
//   offered Salario/Ingreso extra/Reembolso/Otros, never the expense
//   categories, and vice versa. See ai-provider.interface.ts.
// @changelog 1.0.1 — "gemini-1.5-flash" retired by Google (404
//   confirmed in a real test via Bruno, 2026-07-29). Switched to
//   the "gemini-flash-latest" alias to avoid staying pinned to a
//   dated version Google can retire without notice.
// @changelog 1.0.0 — Production implementation of AIProvider on
//   top of the Google Gemini API. Falls back to "Otros" if
//   response text parsing fails -- never throws to the caller over
//   a model formatting error. Zero structural trust in an LLM's
//   payload: always validate, never assume it's well-formed.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AIProvider,
  categoryNamesForType,
  CategoryName,
  ClassificationInput,
  ClassificationResult,
  FALLBACK_CATEGORY,
} from './ai-provider.interface';

@Injectable()
export class GeminiProvider implements AIProvider {
  readonly providerName = 'gemini' as const;

  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenerativeAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    try {
      const model = this.client.getGenerativeModel({
        // "-latest" alias instead of a dated version (e.g.
        // "gemini-1.5-flash"): Google retires point versions
        // without notice -- it already happened to us (404 in
        // real tests, see changelog). The alias always resolves to
        // the current flash model without this file needing to be
        // touched again.
        model: 'gemini-flash-latest',
      });

      const prompt = this.buildPrompt(input);
      const result = await model.generateContent(prompt);
      const rawText = result.response.text().trim();

      const categoryName = this.parseCategory(rawText, input.type);
      return { categoryName };
    } catch (error) {
      this.logger.warn(
        `Gemini classification failed, falling back to "${FALLBACK_CATEGORY}": ${(error as Error).message}`,
      );
      return { categoryName: FALLBACK_CATEGORY };
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

  private parseCategory(
    rawText: string,
    type: ClassificationInput['type'],
  ): CategoryName {
    const normalized = rawText.trim();
    const match = categoryNamesForType(type).find(
      (name) => name.toLowerCase() === normalized.toLowerCase(),
    );
    return match ?? FALLBACK_CATEGORY;
  }
}
