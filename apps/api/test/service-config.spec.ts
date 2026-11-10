import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCorsOrigins } from '../src/cors.js';
import {
  RATE_LIMIT_VARIABLES,
  readRateLimitSettings,
} from '../src/common/guards/rate-limit.config.js';

const yaml = readFileSync(
  fileURLToPath(new URL('../deploy/service.yaml', import.meta.url)),
  'utf8',
);

function valueOf(name: string): string | undefined {
  const match = yaml.match(
    new RegExp(`-\\s+name:\\s*${name}\\s*\\n\\s+value:\\s*"?([^"\\n]+)"?`),
  );
  return match?.[1].trim();
}

describe('apps/api/deploy/service.yaml', () => {
  it.each([...RATE_LIMIT_VARIABLES, 'CORS_ORIGINS'])(
    '007 AC-10: declares %s with a value',
    (name) => {
      expect(valueOf(name)).toBeTruthy();
    },
  );

  it('007 AC-10: the values of the limiter make it active', () => {
    const { settings, problems } = readRateLimitSettings(valueOf);
    expect(problems).toEqual([]);
    expect(settings).not.toBeNull();
  });

  it('007 AC-10: one hop, because the platform proxy is the only one in front', () => {
    expect(valueOf('RATE_LIMIT_TRUSTED_PROXY_HOPS')).toBe('1');
  });

  it('007 AC-10: CORS_ORIGINS lists exact origins, with no wildcard and no preview deployment', () => {
    const { origins, rejected } = readCorsOrigins(valueOf('CORS_ORIGINS'));
    expect(rejected).toEqual([]);
    expect(origins.length).toBeGreaterThan(0);
    for (const origin of origins) {
      expect(origin).toMatch(/^https:\/\//);
      expect(origin).not.toContain('*');
    }
    expect(origins).toEqual([
      'https://nestjs-ai-provider-finance-web.vercel.app',
    ]);
  });
});
