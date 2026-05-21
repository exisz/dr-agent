import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { baseVolumeRepoLocation } from '../src/rules/base-volume-repo-location.js';

const oldAllowlist = process.env.DR_AGENT_BASE_VOLUME_ALLOWLIST;

afterEach(() => {
  if (oldAllowlist === undefined) delete process.env.DR_AGENT_BASE_VOLUME_ALLOWLIST;
  else process.env.DR_AGENT_BASE_VOLUME_ALLOWLIST = oldAllowlist;
});

function initRepo(prefix: string, parent = tmpdir()): string {
  const dir = mkdtempSync(path.join(parent, prefix));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture"}');
  return dir;
}

describe('base-volume-repo-location rule', () => {
  it('does not flag non-base /tmp repos', () => {
    const dir = initRepo('dr-agent-off-volume-', '/private/tmp');
    try {
      const findings = baseVolumeRepoLocation.check([], { scanRoot: dir });
      expect(findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags an unallowlisted repo under the home/base volume', () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), 'dr-agent-home-'));
    const repo = path.join(fakeHome, 'repos', 'app');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
    process.env.DR_AGENT_BASE_VOLUME_ALLOWLIST = path.join(fakeHome, 'missing-allowlist.txt');

    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const findings = baseVolumeRepoLocation.check([], { scanRoot: repo });
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('base-volume-repo-location');
      expect(findings[0].severity).toBe('high');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('does not flag a base-volume repo when its exact root is allowlisted', () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), 'dr-agent-home-'));
    const repo = path.join(fakeHome, 'repos', 'allowed-app');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
    const allowlist = path.join(fakeHome, 'allowlist.txt');
    writeFileSync(allowlist, `${repo}\n`);
    process.env.DR_AGENT_BASE_VOLUME_ALLOWLIST = allowlist;

    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const findings = baseVolumeRepoLocation.check([], { scanRoot: repo });
      expect(findings).toEqual([]);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
