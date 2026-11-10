import { HttpException, type ExecutionContext } from '@nestjs/common';
import { clientAddress } from './client-address.js';
import { readRateLimitSettings } from './rate-limit.config.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { rateLimitSettingsFactory } from './rate-limit.module.js';

const settings = {
  windowMs: 60_000,
  max: 5,
  healthMax: 30,
  trustedProxyHops: 1,
};

function call(
  guard: RateLimitGuard,
  options: { forwardedFor?: string; url?: string; socket?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (options.forwardedFor !== undefined) {
    headers['x-forwarded-for'] = options.forwardedFor;
  }
  const sent: Array<[string, string]> = [];
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        url: options.url ?? '/v1/transactions',
        socket: { remoteAddress: options.socket ?? '10.0.0.1' },
      }),
      getResponse: () => ({
        header: (name: string, value: string) => sent.push([name, value]),
      }),
    }),
  } as unknown as ExecutionContext;
  let error: unknown = null;
  try {
    guard.canActivate(context);
  } catch (e) {
    error = e;
  }
  return { error, sent };
}

function times(
  guard: RateLimitGuard,
  n: number,
  options?: Parameters<typeof call>[1],
) {
  return Array.from({ length: n }, () => call(guard, options));
}

describe('clientAddress', () => {
  it('007 AC-1: with one hop it is the last entry, which the platform proxy wrote', () => {
    expect(clientAddress('1.1.1.1, 2.2.2.2, 203.0.113.9', 1, '10.0.0.1')).toBe(
      '203.0.113.9',
    );
  });

  it('007 AC-1: entries forged at the left do not change it', () => {
    const real = clientAddress('203.0.113.9', 1, '10.0.0.1');
    expect(clientAddress('6.6.6.6, 203.0.113.9', 1, '10.0.0.1')).toBe(real);
    expect(clientAddress('6.6.6.6, 7.7.7.7, 203.0.113.9', 1, '10.0.0.1')).toBe(
      real,
    );
  });

  it('007 AC-1: with two hops it is the second entry from the right', () => {
    expect(clientAddress('9.9.9.9, 203.0.113.9, 130.211.0.1', 2, 'x')).toBe(
      '203.0.113.9',
    );
  });

  it('007 AC-7: without a header, with too few entries or with no hops, it is the address of the socket', () => {
    expect(clientAddress(undefined, 1, '10.0.0.1')).toBe('10.0.0.1');
    expect(clientAddress('', 1, '10.0.0.1')).toBe('10.0.0.1');
    expect(clientAddress('1.1.1.1', 2, '10.0.0.1')).toBe('10.0.0.1');
    expect(clientAddress('1.1.1.1', 0, '10.0.0.1')).toBe('10.0.0.1');
    expect(clientAddress(undefined, 1, undefined)).toBe('unknown');
  });

  it('007 AC-1: a header sent twice is read as one list', () => {
    expect(clientAddress(['6.6.6.6', '203.0.113.9'], 1, 'x')).toBe(
      '203.0.113.9',
    );
  });
});

describe('RateLimitGuard', () => {
  it('007 AC-1: forged leftmost entries do not give a client a new bucket', () => {
    const guard = new RateLimitGuard(settings, () => 0);
    const results = [1, 2, 3, 4, 5, 6].map((i) =>
      call(guard, { forwardedFor: `6.6.6.${i}, 203.0.113.9` }),
    );
    expect(results.slice(0, 5).every((r) => r.error === null)).toBe(true);
    expect(results[5].error).toBeInstanceOf(HttpException);
  });

  it('007 AC-2: two clients with different last entries have separate buckets', () => {
    const guard = new RateLimitGuard(settings, () => 0);
    const a = times(guard, 6, { forwardedFor: '203.0.113.1' });
    expect(a[5].error).toBeInstanceOf(HttpException);
    // The other client is not blocked by the first reaching its limit.
    expect(call(guard, { forwardedFor: '203.0.113.2' }).error).toBeNull();
  });

  it('007 AC-3: /v1/health has its own threshold, and answers at the cadence of the monitor', () => {
    const guard = new RateLimitGuard(settings, () => 0);
    // 30 checks in a window pass, far above one every 10 seconds.
    const checks = times(guard, 30, {
      url: '/v1/health',
      forwardedFor: '203.0.113.5',
    });
    expect(checks.every((r) => r.error === null)).toBe(true);
    expect(
      call(guard, { url: '/v1/health', forwardedFor: '203.0.113.5' }).error,
    ).toBeInstanceOf(HttpException);
  });

  it('007 AC-3: health checks and the other requests of a client do not consume each other', () => {
    const guard = new RateLimitGuard(settings, () => 0);
    times(guard, 5, { forwardedFor: '203.0.113.7' });
    // The client used its api threshold; its health checks still pass.
    expect(
      call(guard, { url: '/v1/health', forwardedFor: '203.0.113.7' }).error,
    ).toBeNull();
    // The query string does not make /v1/health a different route.
    expect(
      call(guard, { url: '/v1/health?x=1', forwardedFor: '203.0.113.7' }).error,
    ).toBeNull();
  });

  it('007 AC-6: exceeding a limit is a 429 with Retry-After, in whole seconds up to the end of the window', () => {
    let time = 0;
    const guard = new RateLimitGuard(settings, () => time);
    times(guard, 5, { forwardedFor: '203.0.113.3' });
    time = 20_000;
    const blocked = call(guard, { forwardedFor: '203.0.113.3' });
    expect(blocked.error).toBeInstanceOf(HttpException);
    expect((blocked.error as HttpException).getStatus()).toBe(429);
    expect(blocked.sent).toEqual([['Retry-After', '40']]);
  });

  it('007 AC-6: the counter starts again when the window ends', () => {
    let time = 0;
    const guard = new RateLimitGuard(settings, () => time);
    times(guard, 6, { forwardedFor: '203.0.113.4' });
    time = 60_000;
    expect(call(guard, { forwardedFor: '203.0.113.4' }).error).toBeNull();
  });

  it('007 AC-7: with no settings it lets every request through', () => {
    const guard = new RateLimitGuard(null, () => 0);
    expect(
      times(guard, 500, { forwardedFor: '203.0.113.8' }).every(
        (r) => r.error === null,
      ),
    ).toBe(true);
  });
});

describe('the settings', () => {
  const all = {
    RATE_LIMIT_WINDOW_SECONDS: '60',
    RATE_LIMIT_MAX: '120',
    RATE_LIMIT_HEALTH_MAX: '30',
    RATE_LIMIT_TRUSTED_PROXY_HOPS: '1',
  } as Record<string, string | undefined>;

  it('007 AC-7: the four variables make an active limiter', () => {
    const { settings: read, problems } = readRateLimitSettings((n) => all[n]);
    expect(problems).toEqual([]);
    expect(read).toEqual({
      windowMs: 60_000,
      max: 120,
      healthMax: 30,
      trustedProxyHops: 1,
    });
  });

  it.each(Object.keys(all))(
    '007 AC-7: with %s missing the limiter is inactive and the log line names it',
    (missing) => {
      const warnings: string[] = [];
      const read = rateLimitSettingsFactory(
        { get: (n) => (n === missing ? undefined : all[n]) },
        { warn: (message) => warnings.push(message) },
      );
      expect(read).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(missing);
    },
  );

  it.each(['0', '-1', '1.5', 'abc', ''])(
    '007 AC-7: a window of %p is not valid, and the limiter is inactive',
    (value) => {
      const { settings: read } = readRateLimitSettings((n) =>
        n === 'RATE_LIMIT_WINDOW_SECONDS' ? value : all[n],
      );
      expect(read).toBeNull();
    },
  );

  it('007 AC-7: zero hops is valid, for a deployment with no proxy in front', () => {
    const { settings: read } = readRateLimitSettings((n) =>
      n === 'RATE_LIMIT_TRUSTED_PROXY_HOPS' ? '0' : all[n],
    );
    expect(read?.trustedProxyHops).toBe(0);
  });

  it('007 AC-7: with every variable set, nothing is logged', () => {
    const warnings: string[] = [];
    rateLimitSettingsFactory(
      { get: (n) => all[n] },
      { warn: (m) => warnings.push(m) },
    );
    expect(warnings).toEqual([]);
  });
});
