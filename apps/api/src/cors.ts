// src/cors.ts
// [F-ID: SRC-CORS-01]
// @version 1.0.0
// @changelog 1.0.0 — CORS from CORS_ORIGINS, a comma-separated list of exact
//   origins (scheme, host and optional port; no path and no wildcard). It fails
//   closed: if the variable is missing or empty, or an entry is not an exact
//   origin, that origin is not allowed. Only the methods and the headers that
//   the web app uses are allowed.

export interface CorsReading {
  origins: string[];
  rejected: string[];
}

const ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;

export function readCorsOrigins(value: string | undefined): CorsReading {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return {
    origins: entries.filter((entry) => ORIGIN.test(entry)),
    rejected: entries.filter((entry) => !ORIGIN.test(entry)),
  };
}

export function corsOptions(origins: string[]) {
  return {
    // With no origin listed, CORS is off: no header is sent for any origin.
    origin: origins.length > 0 ? origins : false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  };
}
