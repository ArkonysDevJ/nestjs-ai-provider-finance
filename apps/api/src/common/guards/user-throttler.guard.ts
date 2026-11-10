// src/common/guards/user-throttler.guard.ts
// [F-ID: SRC-GUARD-USER-THROTTLER-01]
// @version 1.1.0
// @changelog 1.1.0 — The fallback when no user is set is the address of the
//   client taken from X-Forwarded-For (see client-address), not the address of
//   the proxy.
// @changelog 1.0.1 — Lint annotation only: the override keeps the signature of the
//   base class, which uses `any`. No behavior change.
// @changelog 1.0.0 — Rate limits by authenticated user id instead of the
//   default IP-based tracking. Motivation: POST /transactions calls the
//   Gemini API on every request (AI_PROVIDER=gemini classifies inline) --
//   this endpoint is the one with a real per-call cost, and the demo
//   account (public credentials in the README) is the account actually
//   exposed to abuse. IP-based limiting would be both too loose (many
//   users can share one IP behind a proxy/NAT and dodge the limit
//   collectively) and too strict (legitimate users behind the same
//   corporate NAT would share one bucket). Tracking by user.id ties the
//   limit to the thing that actually costs money per request. Must run
//   AFTER SupabaseAuthGuard in the guard chain (class-level guards run
//   before method-level ones in Nest, so applying this at the method
//   level on top of the controller's class-level SupabaseAuthGuard is
//   what guarantees req.user is already set here) -- falls back to the
//   request IP only for the theoretical case of an unauthenticated
//   request reaching this guard, since the route itself already requires
//   auth and would reject it first regardless.

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { trackerOf, type TrackedRequest } from './tracker.js';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const hops = Number(process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS ?? 0);
    return trackerOf(
      req as TrackedRequest,
      Number.isInteger(hops) && hops >= 0 ? hops : 0,
    );
  }
}
