// src/common/decorators/current-user.decorator.ts
// [F-ID: SRC-DECORATOR-CURRENT-USER-01]
// @version 1.0.0
// @changelog 1.0.0 — Extracts the user attached by SupabaseAuthGuard.

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../guards/supabase-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
