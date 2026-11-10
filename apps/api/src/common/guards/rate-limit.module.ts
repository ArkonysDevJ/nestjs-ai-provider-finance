// src/common/guards/rate-limit.module.ts
// [F-ID: SRC-GUARD-RATE-LIMIT-MODULE-01]
// @version 1.0.0
// @changelog 1.0.0 — Registers the rate limiter as a global guard and reads its
//   settings once at startup. If a variable is missing the limiter is inactive,
//   and one log line says which ones.

import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  readRateLimitSettings,
  type RateLimitSettings,
} from './rate-limit.config.js';
import { RATE_LIMIT_SETTINGS, RateLimitGuard } from './rate-limit.guard.js';

export function rateLimitSettingsFactory(
  config: { get(name: string): string | undefined },
  logger: { warn(message: string): void } = new Logger('RateLimit'),
): RateLimitSettings | null {
  const { settings, problems } = readRateLimitSettings((name) =>
    config.get(name),
  );
  if (!settings) {
    logger.warn(
      `The rate limiter is inactive: ${problems.join(', ')} missing or not valid.`,
    );
  }
  return settings;
}

@Module({
  providers: [
    {
      provide: RATE_LIMIT_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        rateLimitSettingsFactory({ get: (name) => config.get<string>(name) }),
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class RateLimitModule {}
