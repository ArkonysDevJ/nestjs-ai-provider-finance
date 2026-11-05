import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lines = readFileSync(
  join(__dirname, '..', '..', '..', '.prettierignore'),
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
