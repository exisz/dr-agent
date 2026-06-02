import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  activeEntries,
  addRegression,
  auditRegression,
  loadRegistry,
  registryPath,
} from '../src/regression-registry.js';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dr-agent-regression-'));
}

describe('regression registry', () => {
  it('tracks lifecycle dates, audit records, and stabilization', () => {
    const dir = tempDir();
    try {
      const file = registryPath(dir, false);
      addRegression(file, {
        id: 'chatgpt_sent_prompt_matches_storyteller_work',
        title: 'Historical sent ChatGPT mails contain the intended Storyteller work',
        requirement: 'LoreMaster must send the intended Storyteller prompt content to ChatGPT.',
        watch: ['Wrong project, stale template, generic placeholder, or malformed sent prompt body.'],
        severity: 'high',
        scope: 'workspace',
        agent: 'loremaster',
        source: 'test',
        createdAt: '2026-06-02',
        howToTest: 'Inspect historical sent ChatGPT mails and verify the outgoing prompt/body matches the intended Storyteller work.',
        command: 'chatgpt pending list --project Storyteller --status all --json',
      });

      auditRegression(file, 'chatgpt_sent_prompt_matches_storyteller_work', 'failed', 'wrong prompt body found', '2026-06-03');
      let entry = loadRegistry(file).entries[0];
      expect(entry.createdAt).toBe('2026-06-02');
      expect(entry.lastKnownRegressionAt).toBe('2026-06-03');
      expect(entry.consecutiveCleanAudits).toBe(0);
      expect(entry.auditRecords).toHaveLength(1);
      expect(entry.howToTest).toContain('historical sent ChatGPT mails');

      for (let i = 1; i <= 14; i += 1) {
        auditRegression(file, 'chatgpt_sent_prompt_matches_storyteller_work', 'passed', 'clean', `2026-06-${String(i + 3).padStart(2, '0')}`);
      }

      entry = loadRegistry(file).entries[0];
      expect(entry.consecutiveCleanAudits).toBe(14);
      expect(entry.stabilizedAt).toBe('2026-06-17');
      expect(activeEntries(loadRegistry(file))).toEqual([]);
      expect(activeEntries(loadRegistry(file), true)).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads migrated yaml regression files when json is absent', () => {
    const dir = tempDir();
    try {
      const yamlPath = registryPath(dir, false).replace(/\.json$/, '.yaml');
      fs.mkdirSync(path.dirname(yamlPath), { recursive: true });
      fs.writeFileSync(yamlPath, `regressions:\n  - id: chatgpt_recent_submissions\n    title: Recent submissions exist\n    severity: high\n    createdAt: '2026-06-02'\n    lastKnownRegressionAt: null\n    stabilizedAt: null\n    consecutiveCleanAudits: 0\n    howToTest: Check recent sent ChatGPT mails.\n    command: chatgpt pending list --project Storyteller --status all --json\n    auditRecords: []\n`);
      const db = loadRegistry(registryPath(dir, false));
      expect(db.entries).toHaveLength(1);
      expect(db.entries[0].howToTest).toBe('Check recent sent ChatGPT mails.');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
