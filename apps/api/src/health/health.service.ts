// src/health/health.service.ts
// [F-ID: SRC-HEALTH-SERVICE-01]
// @version 1.0.0
// @changelog 1.0.0 — Backs GET /v1/health. Runs a trivial real read
//   against the public `categories` table using the anon key — no user
//   JWT, deliberately, since this endpoint is meant to be called by an
//   unattended scheduler with no session to present. The point isn't
//   the response body, it's that Supabase logs the request as genuine
//   database activity: Supabase pauses free-tier projects after ~7
//   days of low activity, and only requests that actually reach
//   Postgres count toward that (a dashboard visit or a plain HTTP ping
//   that never touches the DB doesn't). Reading `categories`
//   anonymously is safe — its RLS policy is already proven public by
//   the pgTAP suite (supabase/tests/database/), not a new assumption
//   introduced here.
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
    const { error } = await this.supabase
      .from('categories')
      .select('id')
      .limit(1);

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
