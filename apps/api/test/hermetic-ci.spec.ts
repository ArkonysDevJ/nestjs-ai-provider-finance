import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

const workflow = readFileSync(
  join(here, '..', '..', '..', '.github', 'workflows', 'ci.yml'),
  'utf8',
);

describe('AC-4: the CI workflow is hermetic', () => {
  it('AC-4: names no hosted project', () => {
    expect(workflow).not.toMatch(/supabase\.co/i);
    expect(workflow).not.toMatch(/qwgtwvimifwfuigcgmbv/);
  });

  it('AC-4: holds no Gemini key', () => {
    expect(workflow).not.toMatch(/GEMINI_API_KEY/i);
    expect(workflow).not.toMatch(/generativelanguage/i);
  });

  it('AC-4: runs the API with the local provider against a loopback server', () => {
    expect(workflow).toMatch(/AI_PROVIDER=local/);
    expect(workflow).toMatch(/LOCAL_AI_ENDPOINT=http:\/\/127\.0\.0\.1:/);
  });
});
