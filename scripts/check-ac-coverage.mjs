#!/usr/bin/env node
// AC-9 of spec 001: every acceptance criterion of every implemented spec is
// cited by name in at least one test file listed in its `Test:` line, and the
// CI steps it names exist. Criteria that are manual checks are listed and exempt.
//
// A spec is enforced when its `Status:` line starts with "implemented". Other
// specs are reported as pending. A test file that several specs list must cite
// its criteria as `NNN AC-n` (the spec number first); otherwise `AC-n` is enough.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const specsDir = join(root, 'specs');
const ciPath = join(root, '.github', 'workflows', 'ci.yml');
const ciText = existsSync(ciPath) ? readFileSync(ciPath, 'utf8') : '';

function readCriteria(text) {
  const criteria = [];
  let current = null;
  for (const line of text.split('\n')) {
    const start = line.match(/^- \*\*(AC-\d+)\.\*\*/);
    if (start) {
      current = { id: start[1], lines: [line] };
      criteria.push(current);
    } else if (/^## /.test(line)) {
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  return criteria;
}

function testLineOf(criterion) {
  return criterion.lines.filter((line) => /^\s+- Test:/.test(line)).join(' ');
}

function pathsIn(testLine) {
  return [...testLine.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter(
      (token) =>
        token.includes('/') && /\.(ts|sql|bru|mjs|cjs|js|sh|py)$/.test(token),
    );
}

function stepsIn(testLine) {
  const afterStep = testLine.match(/CI steps? (.*)/);
  if (!afterStep) return [];
  return [...afterStep[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

const specs = readdirSync(specsDir)
  .filter((name) => /^\d{3}-/.test(name))
  .sort()
  .map((name) => {
    const text = readFileSync(join(specsDir, name, 'spec.md'), 'utf8');
    return {
      name,
      number: name.slice(0, 3),
      implemented: /^Status:\s*implemented/im.test(text),
      criteria: readCriteria(text),
    };
  });

const pathUsers = new Map();
for (const spec of specs) {
  for (const criterion of spec.criteria) {
    for (const path of pathsIn(testLineOf(criterion))) {
      if (!pathUsers.has(path)) pathUsers.set(path, new Set());
      pathUsers.get(path).add(spec.number);
    }
  }
}

const failures = [];
const manual = [];
const pending = [];
let checked = 0;

for (const spec of specs) {
  if (!spec.implemented) {
    pending.push(`${spec.number} (${spec.criteria.length} criteria)`);
    continue;
  }
  for (const criterion of spec.criteria) {
    const label = `${spec.number} ${criterion.id}`;
    const testLine = testLineOf(criterion);
    if (/manual check/i.test(testLine)) {
      manual.push(label);
      continue;
    }
    const paths = pathsIn(testLine);
    const steps = stepsIn(testLine);
    if (paths.length === 0 && steps.length === 0) {
      failures.push(`${label}: no test file or CI step is named`);
      continue;
    }
    checked += 1;
    const id = criterion.id.replace('-', '\\-');
    for (const path of paths) {
      const file = join(root, path);
      if (!existsSync(file)) {
        failures.push(`${label}: ${path} does not exist`);
        continue;
      }
      const shared = pathUsers.get(path).size > 1;
      const pattern = new RegExp(
        shared ? `${spec.number}\\s+${id}\\b` : `${id}\\b`,
      );
      if (!pattern.test(readFileSync(file, 'utf8'))) {
        failures.push(
          `${label}: ${path} does not cite it${shared ? ' as "NNN AC-n"' : ''}`,
        );
      }
    }
    for (const step of steps) {
      if (
        !new RegExp(
          `name:\\s*${step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
          'm',
        ).test(ciText)
      ) {
        failures.push(`${label}: CI step "${step}" does not exist`);
      }
    }
  }
}

console.log(`Acceptance criteria checked: ${checked}`);
if (manual.length) console.log(`Manual checks (exempt): ${manual.join(', ')}`);
if (pending.length)
  console.log(
    `Specs not yet implemented (not enforced): ${pending.join(', ')}`,
  );
if (failures.length) {
  console.error('Acceptance criteria without a citing test:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('Acceptance criteria coverage: ok');
