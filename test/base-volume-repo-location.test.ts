import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { baseVolumeRepoLocation } from '../src/rules/base-volume-repo-location.js';

const oldConfigDir = process.env.DR_AGENT_CONFIG_DIR;
const oldDrAgentHome = process.env.DR_AGENT_HOME;

afterEach(() => {
  if (oldConfigDir === undefined) delete process.env.DR_AGENT_CONFIG_DIR;
  else process.env.DR_AGENT_CONFIG_DIR = oldConfigDir;

  if (oldDrAgentHome === undefined) delete process.env.DR_AGENT_HOME;
  else process.env.DR_AGENT_HOME = oldDrAgentHome;
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
    process.env.DR_AGENT_CONFIG_DIR = path.join(fakeHome, '.dr-agent');

    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const findings = baseVolumeRepoLocation.check([], { scanRoot: repo });
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('base-volume-repo-location');
      expect(findings[0].severity).toBe('high');
      expect(findings[0].fix.join('\n')).toContain('baseVolume.allowedRepos');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('does not flag a base-volume repo when its exact root is allowlisted in YAML config', () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), 'dr-agent-home-'));
    const repo = path.join(fakeHome, 'repos', 'allowed-app');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });

    const configDir = path.join(fakeHome, '.openclaw', '.dr-agent');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.yaml'), [
      'baseVolume:',
      '  allowedRepos:',
      `    - path: ${repo}`,
      '      reason: test fixture',
    ].join('\n'));
    process.env.DR_AGENT_CONFIG_DIR = configDir;

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

  it('supports DR_AGENT_HOME as the config base dir and string entries', () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), 'dr-agent-home-'));
    const repo = path.join(fakeHome, 'repos', 'allowed-string-app');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });

    const configDir = path.join(fakeHome, '.dr-agent');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.yml'), [
      'baseVolume:',
      '  allowedRepos:',
      `    - ${repo}`,
    ].join('\n'));
    process.env.DR_AGENT_HOME = configDir;

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
