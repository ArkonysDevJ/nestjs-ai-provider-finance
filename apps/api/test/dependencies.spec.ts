import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const apiDir = join(here, '..');
const repoDir = join(apiDir, '..', '..');

const lock = JSON.parse(
  readFileSync(join(repoDir, 'package-lock.json'), 'utf8'),
) as {
  packages: Record<
    string,
    { dev?: boolean; devOptional?: boolean; optional?: boolean }
  >;
};
const apiPackage = JSON.parse(
  readFileSync(join(apiDir, 'package.json'), 'utf8'),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

function lockEntries(name: string) {
  return Object.entries(lock.packages).filter(([path]) =>
    path.endsWith(`node_modules/${name}`),
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('dependencies and deployment settings of the AI provider', () => {
  it('AC-8: the MCP SDK is a development dependency, in the manifest and in the lockfile', () => {
    expect(
      apiPackage.dependencies['@modelcontextprotocol/sdk'],
    ).toBeUndefined();
    expect(
      apiPackage.devDependencies['@modelcontextprotocol/sdk'],
    ).toBeDefined();
    const entries = lockEntries('@modelcontextprotocol/sdk');
    expect(entries.length).toBeGreaterThan(0);
    // Every copy is development-only or an optional peer of another package
    // (which the production install omits); none is a production dependency.
    for (const [path, entry] of entries) {
      const notProduction =
        entry.dev === true ||
        entry.devOptional === true ||
        entry.optional === true;
      expect([path, notProduction]).toEqual([path, true]);
    }
  });

  it('AC-9: the MCP server binds the loopback address by default', () => {
    const server = readFileSync(
      join(repoDir, 'finance-classifier-mcp', 'server.py'),
      'utf8',
    );
    expect(server).toMatch(
      /MCP_HOST\s*=\s*os\.environ\.get\("MCP_HOST",\s*"127\.0\.0\.1"\)/,
    );
    expect(server).not.toContain('0.0.0.0');
  });

  it('AC-10: service.yaml sets the model variable', () => {
    const service = readFileSync(
      join(apiDir, 'deploy', 'service.yaml'),
      'utf8',
    );
    expect(service).toMatch(/- name: GEMINI_MODEL\s*\n\s+value: \S+/);
  });

  it('AC-10: no source file uses a "-latest" model alias', () => {
    const offenders = sourceFiles(join(apiDir, 'src')).filter((file) =>
      /gemini[\w.]*-latest/i.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('AC-11: the old Gemini SDK is gone and the new one is used', () => {
    expect(apiPackage.dependencies['@google/generative-ai']).toBeUndefined();
    expect(apiPackage.dependencies['@google/genai']).toBeDefined();
    expect(lockEntries('@google/generative-ai')).toEqual([]);
    expect(lockEntries('@google/genai').length).toBeGreaterThan(0);
    const importsOld = sourceFiles(join(apiDir, 'src')).filter((file) =>
      readFileSync(file, 'utf8').includes('@google/generative-ai'),
    );
    expect(importsOld).toEqual([]);
  });
});
