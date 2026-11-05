import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const lock = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'package-lock.json'), 'utf8'),
) as {
  packages: Record<
    string,
    { version?: string; peerDependencies?: Record<string, string> }
  >;
};

const nestPackages = Object.entries(lock.packages).filter(([path]) =>
  /node_modules\/@nestjs\/[^/]+$/.test(path),
);

describe('AC-5: NestJS packages resolve to the 12.x line', () => {
  it('AC-5: the lockfile holds NestJS packages', () => {
    expect(nestPackages.length).toBeGreaterThan(0);
  });

  it('AC-5: every package with the framework numbering is 12.x', () => {
    for (const [path, entry] of nestPackages) {
      if (path.endsWith('/throttler')) continue;
      const major = Number((entry.version as string).split('.')[0]);
      expect([path, major === 12]).toEqual([path, true]);
    }
  });

  it('AC-5: the throttler declares the 12 line as a peer', () => {
    const throttler = nestPackages.find(([path]) =>
      path.endsWith('/throttler'),
    );
    expect(throttler?.[1].peerDependencies?.['@nestjs/core']).toMatch(/\^12\./);
  });
});
