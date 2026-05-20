import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadDnaDeprecated } from '../src/dna-loader.js';

describe('dna-loader scope', () => {
  it('loads only scan-root local DNA by default', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dr-agent-dna-local-'));
    try {
      const dnaDir = path.join(dir, '.dna', 'deprecated');
      mkdirSync(dnaDir, { recursive: true });
      writeFileSync(path.join(dnaDir, 'local-only.dna'), [
        'type: deprecated',
        'id: dna://deprecated/local-only',
        'pattern: localOnlyPattern',
        'reason: local test',
      ].join('\n'));

      const entries = loadDnaDeprecated(dir);
      expect(entries.map(e => e.id)).toEqual(['dna://deprecated/local-only']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not load global DNA unless explicitly requested', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dr-agent-dna-empty-'));
    try {
      const defaultEntries = loadDnaDeprecated(dir);
      const globalEntries = loadDnaDeprecated(dir, { includeGlobal: true });

      expect(defaultEntries).toEqual([]);
      expect(globalEntries.length).toBeGreaterThanOrEqual(defaultEntries.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
