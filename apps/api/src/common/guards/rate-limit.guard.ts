// src/common/guards/rate-limit.guard.ts
// [F-ID: SRC-GUARD-RATE-LIMIT-01]
// @version 1.0.0
// @changelog 1.0.0 — A rate limiter of the project's own. It is a global guard
//   that runs before authentication, so a flood does not reach the identity
//   provider. It counts requests per client address in a fixed window, in memory
//   and per instance: the counters reset on a restart, and the real limit scales
//   with the number of instances. /v1/health has its own threshold, above the
//   cadence of the uptime monitor. Exceeding a limit is a 429 with Retry-After.
//   With no settings (a variable is missing) it lets everything through.

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { clientAddress } from './client-address.js';
import type { RateLimitSettings } from './rate-limit.config.js';

export const RATE_LIMIT_SETTINGS = Symbol('RATE_LIMIT_SETTINGS');
export const RATE_LIMIT_CLOCK = Symbol('RATE_LIMIT_CLOCK');
export const HEALTH_PATH = '/v1/health';

// Above this many counters, the expired ones are dropped.
const SWEEP_THRESHOLD = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
}

interface HttpReply {
  header(name: string, value: string): unknown;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    @Inject(RATE_LIMIT_SETTINGS)
    private readonly settings: RateLimitSettings | null,
    @Optional()
    @Inject(RATE_LIMIT_CLOCK)
    private readonly now: () => number = Date.now,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.settings) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const reply = http.getResponse<HttpReply>();

    const address = clientAddress(
      request.headers['x-forwarded-for'],
      this.settings.trustedProxyHops,
      request.socket?.remoteAddress ?? request.ip,
    );
    const path = (request.url ?? '').split('?')[0];
    const isHealth = path === HEALTH_PATH;
    const limit = isHealth ? this.settings.healthMax : this.settings.max;
    const key = `${isHealth ? 'health' : 'api'}:${address}`;

    const time = this.now();
    if (this.buckets.size > SWEEP_THRESHOLD) this.sweep(time);
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      bucket = { count: 0, resetAt: time + this.settings.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > limit) {
      const seconds = Math.max(1, Math.ceil((bucket.resetAt - time) / 1000));
      reply.header('Retry-After', String(seconds));
      throw new HttpException(
        'Too many requests.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private sweep(time: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= time) this.buckets.delete(key);
    }
  }
}
