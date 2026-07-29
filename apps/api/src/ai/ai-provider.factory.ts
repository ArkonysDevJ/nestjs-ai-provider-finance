// src/ai/ai-provider.factory.ts
// [F-ID: SRC-AI-FACTORY-01]
// @version 1.0.0
// @changelog 1.0.0 — Resolves the active AIProvider implementation
//   from the AI_PROVIDER env var. Single selection point -- no
//   consumer decides the provider, it only consumes it.

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
