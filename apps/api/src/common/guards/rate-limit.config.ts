// src/common/guards/rate-limit.config.ts
// [F-ID: SRC-GUARD-RATE-LIMIT-CONFIG-01]
// @version 1.0.0
// @changelog 1.0.0 — Settings of the rate limiter, read from four environment
//   variables. If any of them is missing or is not a whole number in range, the
//   limiter is inactive: the application starts, and says so in one log line.
//   service.yaml declares all four, so production never runs without it by
//   omission.

export const RATE_LIMIT_VARIABLES = [
  'RATE_LIMIT_WINDOW_SECONDS',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_HEALTH_MAX',
  'RATE_LIMIT_TRUSTED_PROXY_HOPS',
] as const;

export interface RateLimitSettings {
  windowMs: number;
  max: number;
  healthMax: number;
  trustedProxyHops: number;
}

export interface RateLimitReading {
  settings: RateLimitSettings | null;
  problems: string[];
}

function wholeNumber(
  value: string | undefined,
  minimum: number,
): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

export function readRateLimitSettings(
  read: (name: string) => string | undefined,
): RateLimitReading {
  const windowSeconds = wholeNumber(read('RATE_LIMIT_WINDOW_SECONDS'), 1);
  const max = wholeNumber(read('RATE_LIMIT_MAX'), 1);
  const healthMax = wholeNumber(read('RATE_LIMIT_HEALTH_MAX'), 1);
  const hops = wholeNumber(read('RATE_LIMIT_TRUSTED_PROXY_HOPS'), 0);

  const values: Record<(typeof RATE_LIMIT_VARIABLES)[number], number | null> = {
    RATE_LIMIT_WINDOW_SECONDS: windowSeconds,
    RATE_LIMIT_MAX: max,
    RATE_LIMIT_HEALTH_MAX: healthMax,
    RATE_LIMIT_TRUSTED_PROXY_HOPS: hops,
  };
  const problems = RATE_LIMIT_VARIABLES.filter((name) => values[name] === null);
  if (
    problems.length > 0 ||
    windowSeconds === null ||
    max === null ||
    healthMax === null ||
    hops === null
  ) {
    return { settings: null, problems: [...problems] };
  }
  return {
    settings: {
      windowMs: windowSeconds * 1000,
      max,
      healthMax,
      trustedProxyHops: hops,
    },
    problems: [],
  };
}
