// src/common/decorators/supabase-client.decorator.ts
// [F-ID: SRC-DECORATOR-SUPABASE-CLIENT-01]
// @version 1.0.0
// @changelog 1.0.0 — Extracts the Supabase client scoped to the
//   user's JWT, attached by SupabaseAuthGuard. Services receive it
//   as an explicit parameter from the controller -- no
//   REQUEST-scoped providers, kept simple for a low-volume
//   portfolio project.

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CurrentSupabase = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SupabaseClient => {
    const request = ctx.switchToHttp().getRequest();
    return request.supabase as SupabaseClient;
  },
);
