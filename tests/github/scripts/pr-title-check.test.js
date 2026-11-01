import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../.github/scripts/pr-title-check.js', import.meta.url));
const check = (title) => spawnSync(process.execPath, [SCRIPT], { input: title, encoding: 'utf8' });

describe('pr-title-check', () => {
  it('accepts a conventional title read from stdin', () => {
    const run = check('test(engine): cover rendering and export\n');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('PR title is valid: test(engine): cover rendering and export');
  });

  it.each([
    ['has no type or scope', 'Add a test suite', 'does not match required format'],
    ['uses an unknown type', 'tests(engine): cover rendering', 'Invalid type "tests"'],
    ['starts the description in uppercase', 'feat(app): Add sound sets', 'must start lowercase'],
    ['has a description under 5 characters', 'fix(ui): typo', 'too short'],
    ['is empty', '', 'Usage'],
  ])('rejects a title that %s', (_, title, error) => {
    const run = check(title);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(error);
  });

  it('never runs commands in backticks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'earcue-title-'));
    try {
      const title = `feat(app): add \`touch ${join(dir, 'a')}\` and $(touch ${join(dir, 'b')})`;
      const run = check(title);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain(title);
      expect(existsSync(join(dir, 'a')) || existsSync(join(dir, 'b'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
