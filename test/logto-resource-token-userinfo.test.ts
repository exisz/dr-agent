import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { logtoResourceTokenUserinfo } from '../src/rules/logto-resource-token-userinfo.js';
import type { ScannedFile } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): ScannedFile {
  const fp = path.join(__dirname, 'fixtures', name);
  const content = readFileSync(fp, 'utf-8');
  return { path: fp, content, lines: content.split('\n') };
}

describe('logto-resource-token-userinfo rule', () => {
  it('detects the anti-pattern in bad fixture', () => {
    const file = loadFixture('bad-logto-backend.ts');
    const findings = logtoResourceTokenUserinfo.check([file]);
    expect(findings.length).toBeGreaterThan(0);
    const main = findings.find(f => f.severity === 'high');
    expect(main).toBeDefined();
    expect(main!.ruleId).toBe('logto-resource-token-userinfo');
    expect(main!.title).toContain('will 401');
  });

  it('does NOT flag the good fixture (X-Id-Token pattern)', () => {
    const file = loadFixture('good-logto-backend.ts');
    const findings = logtoResourceTokenUserinfo.check([file]);
    // Good fixture may get a medium finding for resource + audience, but no high
    const highFindings = findings.filter(f => f.severity === 'high');
    expect(highFindings.length).toBe(0);
  });

  it('rule has correct metadata', () => {
    expect(logtoResourceTokenUserinfo.id).toBe('logto-resource-token-userinfo');
    expect(logtoResourceTokenUserinfo.severity).toBe('high');
    expect(logtoResourceTokenUserinfo.title).toBeTruthy();
    expect(logtoResourceTokenUserinfo.description).toBeTruthy();
  });
});
