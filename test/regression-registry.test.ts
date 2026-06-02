import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addRegression, loadRegistry, registryPath, slugify } from '../src/regression-registry.js';

describe('regression registry', () => {
  it('stores workspace regression entries under .dr-agent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-agent-regression-'));
    const file = registryPath(dir, false);

    const entry = addRegression(file, {
      id: 'deprecated-tool-call',
      title: 'Deprecated tool call must not return',
      requirement: 'Use lint tool, not removed proposal tool.',
      watch: ['Search prompts for removed tool name'],
      severity: 'high',
      scope: 'workspace',
      agent: 'loremaster',
      source: 'test',
      createdAt: '2026-06-02T00:00:00.000Z',
    });

    expect(entry.id).toBe('deprecated-tool-call');
    expect(file).toBe(path.join(dir, '.dr-agent', 'regressions.json'));
    expect(loadRegistry(file).entries).toHaveLength(1);
  });

  it('slugifies titles into stable ids', () => {
    expect(slugify('No propose_new_version in prompts!')).toBe('no-propose-new-version-in-prompts');
  });
});
