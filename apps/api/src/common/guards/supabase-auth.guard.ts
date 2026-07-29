// src/common/guards/supabase-auth.guard.ts
// [F-ID: SRC-GUARD-SUPABASE-AUTH-01]
// @version 2.0.0
// @changelog 2.0.0 — Two fixes combined:
//
//   (A) Singleton auth client.
//       v1.0.0 called createClient() on every request, which re-ran
//       supabase-js initialization on each canActivate() call. The auth
//       client (used exclusively for auth.getUser()) is now created once
//       in the constructor and reused across requests. The per-request
//       user-scoped client (RLS) is still created per request because the
//       JWT differs per authenticated user.
//
//   (B) NoopWebSocket transport — Node 20 / Railway compatibility.
//       supabase-js v2 initializes a RealtimeClient internally every time
//       createClient() runs. RealtimeClient requires a WebSocket constructor
//       (globalThis.WebSocket, native since Node 22). Railway runs Node 20,
//       where globalThis.WebSocket is undefined, causing a crash at
//       createClient() time. Setting NODE_VERSION=22 in Railway env vars has
//       no effect on the actual runtime.
//
//       Fix: pass a minimal NoopWebSocket stub as realtime.transport. The
//       stub satisfies the RealtimeClient's type expectation without touching
//       the network. Since the backend never calls .channel().subscribe(), the
//       stub is never actually instantiated by the realtime internals.
//
// @changelog 1.0.0 — Generic Supabase Auth + NestJS guard.
//   Industry-standard pattern: validates the Bearer token against
//   supabase.auth.getUser() and attaches a Supabase client scoped to the
//   user's JWT on request.supabase.
//
//   Deliberately generic: no admin client, no manual multi-tenant filtering.
//   Single-tenant per user -- RLS via auth.uid() is all the isolation needed.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AuthenticatedUser {
  id: string;
  email: string | undefined;
}

// Local extension of the Fastify request -- not exported outside this module.
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    supabase?: SupabaseClient;
  }
}

// Minimal WebSocket stub.
// Passed as realtime.transport to both createClient() calls so supabase-js
// doesn't require globalThis.WebSocket (Node 22+) or the 'ws' package.
// Never actually instantiated -- the backend has no realtime subscriptions.
class NoopWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
}

// Shared options applied to every createClient() call in this guard.
// transport: NoopWebSocket as any — avoids a TS mismatch between our minimal
// stub and the full DOM WebSocket instance type that supabase-js expects.
// The value is never used at runtime (no realtime subscriptions).
const SUPABASE_BASE_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realtime: { transport: NoopWebSocket as any },
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  // Singleton client used exclusively for token validation (auth.getUser).
  // Has no JWT in global headers -- not suitable for RLS queries.
  // Initialized once in the constructor; reused across requests.
  private readonly authClient: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = configService.getOrThrow<string>('SUPABASE_URL');
    this.supabaseAnonKey = configService.getOrThrow<string>('SUPABASE_ANON_KEY');
    this.authClient = createClient(
      this.supabaseUrl,
      this.supabaseAnonKey,
      SUPABASE_BASE_OPTIONS,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }

    // Validate the token using the singleton auth client.
    // auth.getUser() accepts the token explicitly -- no global JWT needed.
    const { data, error } = await this.authClient.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Per-request client scoped to the user's JWT.
    // Not an admin client -- every subsequent query respects RLS via auth.uid().
    // A new client per request is necessary because the JWT (and thus the RLS
    // identity) differs per authenticated user.
    const supabase = createClient(this.supabaseUrl, this.supabaseAnonKey, {
      ...SUPABASE_BASE_OPTIONS,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    request.user = { id: data.user.id, email: data.user.email };
    request.supabase = supabase;

    return true;
  }
}
