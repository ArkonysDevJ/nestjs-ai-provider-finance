// src/ai/ai.module.ts
// [F-ID: SRC-AI-MODULE-01]
// @version 1.0.0
// @changelog 1.0.0 — Exposes AI_PROVIDER as the single injection
//   point for consumers of this module (TransactionsModule).

import { Module } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import { LocalProvider } from './local.provider';
import { aiProviderFactory } from './ai-provider.factory';
import { AI_PROVIDER } from './ai-provider.interface';

@Module({
  providers: [GeminiProvider, LocalProvider, aiProviderFactory],
  exports: [AI_PROVIDER],
})
export class AiModule {}
