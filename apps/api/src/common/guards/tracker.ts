// src/common/guards/tracker.ts
// [F-ID: SRC-GUARD-TRACKER-01]
// @version 1.0.0
// @changelog 1.0.0 — What a request is counted by in the per-user limit: the id
//   of the authenticated user, or, if no user is set, the address of the client
//   taken from X-Forwarded-For (see client-address). It is a function of its own,
//   without the throttler, so it can be tested on its own.

import { clientAddress } from './client-address.js';

export interface TrackedRequest {
  user?: { id?: string };
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  ip?: string;
}

export function trackerOf(request: TrackedRequest, hops: number): string {
  if (request.user?.id) return request.user.id;
  return clientAddress(
    request.headers?.['x-forwarded-for'],
    hops,
    request.socket?.remoteAddress ?? request.ip,
  );
}
