import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The application cannot be loaded under Jest: the throttler is CommonJS and
// requires an ES module in a cycle. So the rate limiting is checked on the
// sources of the application.
const srcDir = fileURLToPath(new URL('../src', import.meta.url));

function sources(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
      return [];
    }
    return [{ file: path, text: readFileSync(path, 'utf8') }];
  });
}

const code = sources(srcDir).map(({ file, text }) => ({
  file,
  // Comments are not code: a changelog may name what was removed.
  text: text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
}));

describe('007 AC-5: the rate limiting of the application', () => {
  it('007 AC-5: there is exactly one ThrottlerModule.forRoot', () => {
    const calls = code.flatMap(({ file, text }) =>
      [...text.matchAll(/ThrottlerModule\.forRoot\(/g)].map(() => file),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('transactions.module.ts');
  });

  it('007 AC-5: there is no global throttler guard', () => {
    const global = code.filter(({ text }) =>
      /provide:\s*APP_GUARD,\s*useClass:\s*ThrottlerGuard\b/.test(text),
    );
    expect(global).toEqual([]);
  });

  it('007 AC-5: the limiter of the project is the one global guard', () => {
    const global = code.flatMap(({ file, text }) =>
      [...text.matchAll(/provide:\s*APP_GUARD/g)].map(() => file),
    );
    expect(global).toHaveLength(1);
    expect(global[0]).toContain('rate-limit.module.ts');
  });

  it('007 AC-5: the application imports the module of the limiter', () => {
    const app = code.find(({ file }) => file.endsWith('app.module.ts'));
    expect(app?.text).toContain('RateLimitModule');
  });
});
