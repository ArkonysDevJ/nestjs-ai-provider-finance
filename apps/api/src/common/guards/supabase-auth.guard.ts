// src/common/guards/supabase-auth.guard.ts
// [F-ID: SRC-GUARD-SUPABASE-AUTH-01]
// @version 1.0.0
// @changelog 1.0.0 — Generic Supabase Auth + NestJS guard.
//   Industry-standard pattern (equivalent to Supabase's own
//   official docs): validates the Bearer token against
//   supabase.auth.getUser() and attaches a Supabase client scoped
//   to the user's JWT on request.supabase.
//
//   Deliberately generic, on purpose: this project uses a Supabase
//   client scoped to the user's own JWT, so RLS applies natively
//   via auth.uid() -- no admin client, no manual multi-tenant
//   filtering, because there's no tenant concept here at all. It's
//   single-tenant per user, so there's nothing to isolate beyond
//   what RLS already guarantees on its own.

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

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

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

    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseAnonKey =
      this.configService.getOrThrow<string>('SUPABASE_ANON_KEY');

    // Client scoped to the requesting user's JWT.
    // Not an admin client -- every subsequent query respects RLS.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = { id: data.user.id, email: data.user.email };
    request.supabase = supabase;

    return true;
  }
}
