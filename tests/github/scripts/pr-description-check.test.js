import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../.github/scripts/pr-description-check.js', import.meta.url));
const check = (body) => spawnSync(process.execPath, [SCRIPT], { input: body, encoding: 'utf8' });

// Every section of .github/pull_request_template.md, filled in.
const body = ({ description = 'Adds a Vitest suite for the engine, the store and the PR scripts, and runs it in CI.', notInScope = true } = {}) =>
  [
    '# Description',
    description,
    '',
    '## Documentation',
    '- **Issue/Ticket:** none',
    '- **Dependencies:** vitest, jsdom, node-web-audio-api',
    '',
    '# Changes',
    '',
    '## In Scope',
    '',
    '- Unit tests for the model, engine, export and store',
    '- A CI workflow that runs the tests and the build',
    '',
    ...(notInScope ? ['## Not in Scope', '', '- Component tests, which need a browser', ''] : []),
    '## Breaking Changes',
    'None.',
    '',
    '## Deployment Notes',
    'None.',
    '',
    '# Media',
    'No visual changes in this PR',
    '',
    '# Tests to Run for this PR',
    '- [x] `npm run build`',
    '- [x] `npm test`',
    '',
    '# Checklist',
    '',
    '## Author Checklist',
    '- [x] Code follows project conventions',
    '',
    '## Reviewer Checklist',
    '- [ ] Logic and approach make sense',
    '',
  ].join('\n');

describe('pr-description-check', () => {
  it('accepts a body with every template section filled in', () => {
    const run = check(body());
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('PR description is valid.');
  });

  it('rejects a body that is missing a section', () => {
    const run = check(body({ notInScope: false }));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Missing section: "## Not in Scope"');
  });

  it('rejects a section that still holds template text', () => {
    const run = check(body({ description: '<!-- Explain what this PR does and why -->' }));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Section "# Description" still contains template placeholder text');
  });

  it('does not read a # comment in fenced code as a heading', () => {
    const run = check(body({ description: '```sh\n# run the suite\nnpm test\n```' }));
    expect(run.status).toBe(0);
  });

  it('never runs commands in backticks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'earcue-body-'));
    try {
      const run = check(body({ description: `Mentions \`touch ${join(dir, 'a')}\` and $(touch ${join(dir, 'b')}) in passing.` }));
      expect(run.status).toBe(0);
      expect(existsSync(join(dir, 'a')) || existsSync(join(dir, 'b'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
