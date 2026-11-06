import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..', '..', '..');

const specDir = readdirSync(join(root, 'specs')).find((name) =>
  name.startsWith('002-'),
) as string;
const plan = readFileSync(join(root, 'specs', specDir, 'plan.md'), 'utf8');
const workflow = readFileSync(
  join(root, '.github', 'workflows', 'ci.yml'),
  'utf8',
);

function remainingClosingSpecs(): string[] {
  const block = plan
    .split('<!-- remaining-advisories:start -->')[1]
    ?.split('<!-- remaining-advisories:end -->')[0];
  if (!block) throw new Error('recorded advisory list not found');
  return block
    .split('\n')
    .filter((line) => /^\|/.test(line) && !/^\|\s*(package|---)/.test(line))
    .map((line) => line.split('|')[3].trim());
}

function auditStepIsBlocking(): boolean {
  const step = workflow.split('name: Dependency audit')[1];
  if (!step) throw new Error('audit step not found');
  const command = step
    .split('\n')
    .find((line) => line.includes('npm audit')) as string;
  return !command.includes('||');
}

describe('AC-4: the audit step matches the recorded advisories', () => {
  it('AC-4: the recorded list is not empty and every row names a closing spec', () => {
    const closing = remainingClosingSpecs();
    expect(closing.length).toBeGreaterThan(0);
    closing.forEach((value) => expect(value).toMatch(/^(\d{3}|none)$/));
  });

  it('AC-4: the step is blocking if and only if only spec 004 remains', () => {
    const onlyFourth = remainingClosingSpecs().every(
      (value) => value === '004',
    );
    expect(auditStepIsBlocking()).toBe(onlyFourth);
  });
});
