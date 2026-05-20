import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { localDevDrift } from '../src/rules/local-dev-drift.js';
import type { ScannedFile } from '../src/types.js';

function f(filePath: string, content: string): ScannedFile {
  return { path: filePath, content, lines: content.split('\n') };
}

describe('local-dev-drift rule', () => {
  it('does not report hardcoded global tool repos when scanning an unrelated project', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dr-agent-unrelated-'));
    try {
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'not-globally-linked-test-app' }));
      const findings = localDevDrift.check([
        f('package.json', JSON.stringify({ name: 'not-globally-linked-test-app' })),
      ], { scanRoot: dir });

      expect(findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not run without a package.json context', () => {
    const findings = localDevDrift.check([], { scanRoot: process.cwd() });
    expect(findings).toEqual([]);
  });
});
