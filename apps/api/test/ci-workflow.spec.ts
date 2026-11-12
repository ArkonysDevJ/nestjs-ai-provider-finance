import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflow = readFileSync(
  fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url)),
  'utf8',
);

/** The text of one step of the `ci` job, from its `- name:` line to the next. */
function stepOf(name: string): string {
  const start = workflow.indexOf(`- name: ${name}\n`);
  if (start === -1) throw new Error(`Step "${name}" not found in ci.yml`);
  const next = workflow.indexOf('\n      - name:', start + 1);
  return workflow.slice(start, next === -1 ? undefined : next);
}

const smoke = stepOf('Container smoke test');

describe('.github/workflows/ci.yml, container smoke test', () => {
  it('009 AC-1: runs after the image is built, and runs that image', () => {
    expect(
      workflow.indexOf('- name: Build the container image'),
    ).toBeGreaterThan(-1);
    expect(workflow.indexOf('- name: Container smoke test')).toBeGreaterThan(
      workflow.indexOf('- name: Build the container image'),
    );
    expect(smoke).toContain('docker run');
    expect(smoke).toContain('ai-finance-api:ci');
  });

  it('009 AC-1: the container has no network', () => {
    expect(smoke).toContain('--network none');
  });

  it('009 AC-1: no variable and no request names a host outside the container', () => {
    const hosts = [...smoke.matchAll(/https?:\/\/([^/\s"':]+)/g)].map(
      (match) => match[1],
    );
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(['127.0.0.1', 'localhost']).toContain(host);
    }
  });

  it('009 AC-1: every key is a placeholder', () => {
    expect(smoke).toMatch(/SUPABASE_ANON_KEY=placeholder-/);
    expect(smoke).toMatch(/GEMINI_API_KEY=placeholder-/);
  });

  it('009 AC-2: waits at most 30 seconds for the process to answer', () => {
    expect(smoke).toContain('seq 1 30');
    expect(smoke).toContain('sleep 1');
  });

  it('009 AC-2: passes only on 401 from a route that needs a token and 503 from health', () => {
    expect(smoke).toContain('"${categories}" = "401"');
    expect(smoke).toContain('"${health}" = "503"');
  });

  it('009 AC-3: a container that stops or does not answer fails the step and prints its logs', () => {
    expect(smoke).toContain('.State.Running');
    expect(smoke).toContain('The container stopped before it answered.');
    expect(smoke).toContain('The container did not answer within 30 seconds.');
    expect(smoke).toContain('docker logs');
    expect(smoke).toContain('exit 1');
  });

  it('009 AC-3: it never prints the environment of the container', () => {
    expect(smoke).not.toMatch(/printenv|docker inspect[^\n]*Env/);
    expect(smoke.match(/docker inspect[^\n]*/g)).toEqual([
      expect.stringContaining('.State.Running'),
    ]);
  });

  it('009 AC-4: removes the container whether the step passes or fails', () => {
    expect(smoke).toMatch(/trap '[^']*docker rm -f[^']*' EXIT/);
  });
});
