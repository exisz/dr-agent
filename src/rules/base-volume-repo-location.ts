// Rule: repo lives on the Mac mini base/internal volume instead of external storage.
//
// The 256G internal disk should hold the OS, user config, caches, and a small
// explicit allowlist of operational repos only. Normal working repos belong on
// the large external volume (for this host, usually /Volumes/2t or a symlink to
// it). This rule flags scans whose git repo root resolves to the base volume,
// unless that repo root is listed in a base-volume allowlist file.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

const DEFAULT_ALLOWLIST_BASENAME = 'base-volume-repo-allowlist.txt';

function realpathOrResolve(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

function normalizePath(p: string): string {
  const expanded = p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
  return realpathOrResolve(expanded).replace(/\/$/, '');
}

function isUnder(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function isOnBaseVolume(absPath: string): boolean {
  const real = realpathOrResolve(absPath);

  // External/offloaded volumes are mounted here on macOS. Symlinks such as
  // ~/2t resolve to /Volumes/2t before this check.
  if (real === '/Volumes' || real.startsWith('/Volumes/')) return false;

  // Repo roots under the user's home are the common failure mode: they consume
  // the 256G internal Data volume instead of the large external disk.
  const home = realpathOrResolve(os.homedir());
  if (isUnder(home, real)) return true;

  // Also treat common internal development roots as base-volume locations.
  return real.startsWith('/Users/') || real.startsWith('/opt/') || real.startsWith('/usr/local/');
}

function findGitRoot(scanRoot: string): string | undefined {
  try {
    const output = execFileSync('git', ['-C', scanRoot, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim();
    return output ? realpathOrResolve(output) : undefined;
  } catch {
    return undefined;
  }
}

function allowlistPaths(): string[] {
  const envPath = process.env.DR_AGENT_BASE_VOLUME_ALLOWLIST;
  return [
    ...(envPath ? envPath.split(path.delimiter) : []),
    path.join(os.homedir(), '.openclaw', DEFAULT_ALLOWLIST_BASENAME),
    path.join(os.homedir(), '.config', 'dr-agent', DEFAULT_ALLOWLIST_BASENAME),
  ];
}

function readAllowlist(): { entries: string[]; files: string[] } {
  const entries: string[] = [];
  const files: string[] = [];

  for (const allowlistPath of allowlistPaths()) {
    if (!allowlistPath || !existsSync(allowlistPath)) continue;
    files.push(allowlistPath);
    const content = readFileSync(allowlistPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*/, '').trim();
      if (!line) continue;
      entries.push(normalizePath(line));
    }
  }

  return { entries, files };
}

function isAllowed(repoRoot: string, entries: string[]): boolean {
  const normalizedRepoRoot = normalizePath(repoRoot);
  return entries.some(entry => entry === normalizedRepoRoot);
}

export const baseVolumeRepoLocation: Rule = {
  id: 'base-volume-repo-location',
  severity: 'high',
  title: 'Git repo lives on the Mac mini base volume',
  description:
    'Working repos should not silently accumulate on the small internal/base volume. Move normal repos to the large external volume and keep only explicit allowlisted repos on the base volume.',

  check(_files: ScannedFile[], ctx?: RuleContext): Finding[] {
    const scanRoot = ctx?.scanRoot ?? process.cwd();
    const repoRoot = findGitRoot(scanRoot);
    if (!repoRoot || !isOnBaseVolume(repoRoot)) return [];

    const { entries, files } = readAllowlist();
    if (isAllowed(repoRoot, entries)) return [];

    const allowlistDisplay = files.length > 0
      ? files.map(f => `\`${f}\``).join(', ')
      : `\`~/.openclaw/${DEFAULT_ALLOWLIST_BASENAME}\``;

    return [{
      ruleId: 'base-volume-repo-location',
      severity: 'high',
      title: `Repo at ${repoRoot} is on the base volume — offload or allowlist deliberately`,
      why:
        'The Mac mini internal/base volume is small and already pressure-sensitive. ' +
        'A repo rooted here consumes the 256G disk instead of the external storage volume, ' +
        'so clones, node_modules, build artifacts, caches, and worktrees pile up in the wrong place.',
      fix: [
        'Stop treating this as a normal working clone until its location is resolved.',
        'If this repo is not intentionally base-resident, move/reclone it under the external storage root, e.g. `/Volumes/2t/...` or a symlink that resolves there.',
        'Update any agent workspace docs, service paths, symlinks, launchd units, and tool configs that point at the old base-volume path.',
        `If this repo is intentionally allowed to remain on the base volume, add its exact repo root to ${allowlistDisplay}.`,
        'Re-run `dr-agent run <repo> --rules base-volume-repo-location` and confirm the finding is gone only for allowlisted repos.',
      ],
      references: [
        'dna://flow/base-volume-repo-offload',
        `~/.openclaw/${DEFAULT_ALLOWLIST_BASENAME}`,
      ],
      file: repoRoot,
    }];
  },
};
