// src/ai/ai.module.ts
// [F-ID: SRC-AI-MODULE-01]
// @version 3.0.0
// @changelog 3.0.0 — The single place that selects the provider. The settings
//   are read and validated first (config.ts), so a bad AI_PROVIDER, a missing
//   model, or "local" in production stops startup. Only the selected provider
//   is constructed. The duplicate selection code (ai-provider.factory.ts) is
//   removed.
// @changelog 2.0.0 — Conditional registration fix: a single useFactory that
//   constructs only the chosen provider.
// @changelog 1.0.0 — Exposes AI_PROVIDER as the single injection point for
//   consumers of this module (TransactionsModule).

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AIProvider } from './ai-provider.interface.js';
import { AiConfig, readAiConfig } from './config.js';
import { GeminiProvider } from './gemini.provider.js';
import { GeminiSdkClient } from './gemini.sdk-client.js';
import { LocalProvider } from './local.provider.js';
import { McpClassifierClient } from './local.mcp-client.js';

export interface ProviderFactories {
  gemini(
    config: NonNullable<AiConfig['gemini']>,
    timeoutMs: number,
  ): AIProvider;
  local(config: NonNullable<AiConfig['local']>, timeoutMs: number): AIProvider;
}

export const defaultProviderFactories: ProviderFactories = {
  gemini: (config, timeoutMs) =>
    new GeminiProvider(new GeminiSdkClient(config.apiKey, config.model), {
      model: config.model,
      timeoutMs,
    }),
  local: (config, timeoutMs) =>
    new LocalProvider(new McpClassifierClient(config.endpoint), { timeoutMs }),
};

/** Builds the selected provider. The other one is never constructed. */
export function selectAiProvider(
  config: AiConfig,
  factories: ProviderFactories = defaultProviderFactories,
): AIProvider {
  return config.provider === 'local'
    ? factories.local(config.local!, config.timeoutMs)
    : factories.gemini(config.gemini!, config.timeoutMs);
}

/** The factory Nest runs at startup: a bad setting throws and startup stops. */
export function aiProviderFactory(configService: ConfigService): AIProvider {
  return selectAiProvider(
    readAiConfig((key) => configService.get<string>(key)),
  );
}

@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      useFactory: aiProviderFactory,
      inject: [ConfigService],
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
