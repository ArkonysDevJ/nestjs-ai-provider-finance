// src/health/health.service.ts
// [F-ID: SRC-HEALTH-SERVICE-01]
// @version 1.1.0
// @changelog 1.1.0 — Switched from `.from('categories').select()` to
//   `.rpc('ping')` (see supabase/migrations/005_health_ping.sql).
//   The categories query broke in production: the anon key has no
//   GRANT on categories at all (002_grants.sql only grants
//   `authenticated`), so every call returned a real 42501 permission
//   error, surfaced as a 503 on every scheduled ping. `ping()` is a
//   SECURITY DEFINER function with its own narrow EXECUTE grant to
//   `anon` — fully decoupled from table permissions, so it can't be
//   broken by a future grants change the same way.
// @changelog 1.0.0 — Backs GET /v1/health. No user JWT, deliberately,
//   since this endpoint is meant to be called by an unattended
//   scheduler with no session to present. The point isn't the
//   response body, it's that Supabase logs the request as genuine
//   database activity: Supabase pauses free-tier projects after ~7
//   days of low activity, and only requests that actually reach
//   Postgres count toward that (a dashboard visit or a plain HTTP
//   ping that never touches the DB doesn't).
//
//   Duplicates the NoopWebSocket stub from SupabaseAuthGuard instead
//   of sharing it — deliberate, so this endpoint stays fully
//   independent of the auth path and keeps working even if the guard
//   changes. See that guard for the underlying Node 20 / Railway
//   WebSocket-constructor issue this stub works around.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Minimal WebSocket stub — see SupabaseAuthGuard for why this exists.
// Never actually instantiated (no realtime subscriptions here either).
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

export interface HealthStatus {
  status: 'ok';
  database: 'reachable';
  timestamp: string;
}

@Injectable()
export class HealthService {
  // Singleton, anon-key client — no per-request JWT to scope, unlike
  // SupabaseAuthGuard's per-request client.
  private readonly supabase: SupabaseClient;

  constructor(configService: ConfigService) {
    const supabaseUrl = configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseAnonKey =
      configService.getOrThrow<string>('SUPABASE_ANON_KEY');

    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      realtime: { transport: NoopWebSocket as any },
    });
  }

  async check(): Promise<HealthStatus> {
    const { error } = await this.supabase.rpc('ping');

    if (error) {
      throw error;
    }

    return {
      status: 'ok',
      database: 'reachable',
      timestamp: new Date().toISOString(),
    };
  }
}
