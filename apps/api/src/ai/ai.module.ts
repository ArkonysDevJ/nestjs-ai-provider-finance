// src/ai/ai.module.ts
// [F-ID: SRC-AI-MODULE-01]
// @version 2.0.0
// @changelog 2.0.0 — Conditional registration fix. Previously, both
//   GeminiProvider and LocalProvider were listed as providers, so NestJS
//   instantiated BOTH at startup regardless of AI_PROVIDER. LocalProvider's
//   constructor calls configService.getOrThrow('LOCAL_AI_ENDPOINT'), which
//   threw on Railway (AI_PROVIDER=gemini, LOCAL_AI_ENDPOINT not set) before
//   the factory ever ran.
//
//   Fix: single useFactory that calls new GeminiProvider() or
//   new LocalProvider() conditionally. Only the chosen provider is ever
//   instantiated -- the other never runs its constructor.
//
//   ai-provider.factory.ts is superseded and no longer imported; the
//   selection logic now lives here where it controls instantiation, not just
//   returns an already-constructed instance.
//
//   OnModuleDestroy (LocalProvider.onModuleDestroy closes the MCP client) is
//   unaffected: NestJS calls lifecycle hooks on factory-provided instances
//   the same way it does for class-provided ones.
// @changelog 1.0.0 — Exposes AI_PROVIDER as the single injection point for
//   consumers of this module (TransactionsModule).

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
import { LocalProvider } from './local.provider';
import { AI_PROVIDER, AiProviderName } from './ai-provider.interface';

@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const selected =
          configService.get<AiProviderName>('AI_PROVIDER') ?? 'gemini';

        switch (selected) {
          case 'local':
            // LocalProvider's constructor reads LOCAL_AI_ENDPOINT via
            // getOrThrow -- only runs when explicitly requested.
            return new LocalProvider(configService);
          case 'gemini':
            return new GeminiProvider(configService);
          default:
            throw new Error(
              `Invalid AI_PROVIDER: "${selected}". Allowed values: gemini | local.`,
            );
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
