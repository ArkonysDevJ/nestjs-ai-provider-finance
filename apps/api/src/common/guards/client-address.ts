// src/common/guards/client-address.ts
// [F-ID: SRC-GUARD-CLIENT-ADDRESS-01]
// @version 1.0.0
// @changelog 1.0.0 — The address of the client behind a proxy, taken from
//   X-Forwarded-For counting from the right. Each proxy appends the address it
//   received the request from, so the entries on the left are written by the
//   client and cannot be trusted; the one that the platform proxy appended is
//   at a fixed distance from the right end. `hops` is that distance: with 1 it
//   is the last entry. Without enough entries, or with 0 hops (no proxy in
//   front, as in local development), the address of the socket is used.

export function clientAddress(
  header: string | string[] | undefined,
  hops: number,
  socketAddress: string | undefined,
): string {
  const raw = Array.isArray(header) ? header.join(',') : (header ?? '');
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (hops >= 1 && entries.length >= hops) {
    return entries[entries.length - hops];
  }
  return socketAddress ?? 'unknown';
}
