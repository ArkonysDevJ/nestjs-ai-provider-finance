// src/ai/ai-provider.factory.ts
// [F-ID: SRC-AI-FACTORY-01]
// @version 1.0.0 — SUPERSEDED by ai.module.ts v2.0.0
//
// This file is no longer imported. The conditional selection logic was
// moved into ai.module.ts so that instantiation (not just selection) is
// conditional: the old pattern registered GeminiProvider AND LocalProvider
// as providers and let the factory choose between two already-constructed
// instances -- LocalProvider's constructor would throw at startup if
// LOCAL_AI_ENDPOINT was not set (e.g. production with AI_PROVIDER=gemini).
//
// Kept for reference only. Safe to delete in a future cleanup pass.

import { ConfigService } from '@nestjs/config';
import { FactoryProvider } from '@nestjs/common';
import { AI_PROVIDER, AiProviderName } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { LocalProvider } from './local.provider';

export const aiProviderFactory: FactoryProvider = {
  provide: AI_PROVIDER,
  inject: [ConfigService, GeminiProvider, LocalProvider],
  useFactory: (
    configService: ConfigService,
    geminiProvider: GeminiProvider,
    localProvider: LocalProvider,
  ) => {
    const selected =
      configService.get<AiProviderName>('AI_PROVIDER') ?? 'gemini';

    switch (selected) {
      case 'gemini':
        return geminiProvider;
      case 'local':
        return localProvider;
      default:
        throw new Error(
          `Invalid AI_PROVIDER: "${selected}". Allowed values: gemini | local.`,
        );
    }
  },
};
