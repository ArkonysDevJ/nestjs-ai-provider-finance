import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

const environments = join(
  here,
  '..',
  '..',
  '..',
  'bruno',
  'nestjs-ai-provider-finance',
  'environments',
);
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

describe('AC-5: Bruno environments', () => {
  const localFiles = readdirSync(environments).filter((name) =>
    name.startsWith('local'),
  );

  it('AC-5: a local environment exists and the hosted one is named demo', () => {
    expect(localFiles).toContain('local-stack.bru');
    expect(existsSync(join(environments, 'demo.bru'))).toBe(true);
    expect(existsSync(join(environments, 'local.bru'))).toBe(false);
  });

  it.each(localFiles)('AC-5: %s points only to loopback hosts', (name) => {
    const text = readFileSync(join(environments, name), 'utf8');
    const urls = [...text.matchAll(/https?:\/\/[^\s"']+/g)].map(
      (match) => match[0],
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(LOOPBACK).toContain(new URL(url).hostname);
    }
  });
});
