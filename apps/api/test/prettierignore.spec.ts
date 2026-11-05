import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

const lines = readFileSync(
  join(here, '..', '..', '..', '.prettierignore'),
  'utf8',
)
  .split('\n')
  .map((line) => line.trim());

describe('AC-7: .prettierignore', () => {
  it('AC-7: excludes the migrations and the lockfile', () => {
    expect(lines).toContain('supabase/migrations/**');
    expect(lines).toContain('package-lock.json');
  });
});
