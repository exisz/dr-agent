// Rule: repo lives on the Mac mini base/internal volume instead of external storage.
//
// The 256G internal disk should hold the OS, user config, caches, and a small
// explicit allowlist of operational repos only. Normal working repos belong on
// the large external volume (for this host, usually /Volumes/2t or a symlink to
// it). This rule flags scans whose git repo root resolves to the base volume,
// unless that repo root is listed in dr-agent YAML config. Allowlist entries
// may use `*` for exactly one path segment (for example
// `/Users/c/.openclaw/workspaces/*`), but wildcards never cross `/`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

const CONFIG_FILE_NAMES = ['config.yaml', 'config.yml'];

type AllowlistEntry = string | { path?: string; repo?: string; reason?: string };
interface DrAgentConfig {
  baseVolume?: {
    allowedRepos?: AllowlistEntry[];
    allowlist?: AllowlistEntry[];
  };
}

function realpathOrResolve(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function normalizePath(p: string): string {
  return realpathOrResolve(expandHome(p)).replace(/\/$/, '');
}

function normalizeAllowlistEntry(p: string): string {
  const expanded = expandHome(p);
  if (expanded.includes('*')) return path.resolve(expanded).replace(/\/$/, '');
  return normalizePath(expanded);
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globSegmentPatternToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\/$/, '');
  const parts = normalized.split('*').map(escapeRegex);
  return new RegExp(`^${parts.join('[^/]+')}$`);
}

function matchesAllowlistEntry(entry: string, repoRoot: string): boolean {
  if (!entry.includes('*')) return entry === repoRoot;
  return globSegmentPatternToRegex(entry).test(repoRoot);
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

function defaultConfigDir(): string {
  const openclawDir = path.join(os.homedir(), '.openclaw', '.dr-agent');
  if (existsSync(openclawDir)) return openclawDir;
  return path.join(os.homedir(), '.dr-agent');
}

function configDirs(): string[] {
  const configured = process.env.DR_AGENT_CONFIG_DIR ?? process.env.DR_AGENT_HOME;
  if (configured) return configured.split(path.delimiter).filter(Boolean).map(expandHome);
  return [defaultConfigDir()];
}

function configFiles(): string[] {
  return configDirs().flatMap(dir => CONFIG_FILE_NAMES.map(name => path.join(dir, name)));
}

function entryPath(entry: AllowlistEntry): string | undefined {
  if (typeof entry === 'string') return entry;
  return entry.path ?? entry.repo;
}

function readAllowedRepos(): { entries: string[]; files: string[] } {
  const entries: string[] = [];
  const files: string[] = [];

  for (const configFile of configFiles()) {
    if (!existsSync(configFile)) continue;
    files.push(configFile);

    const parsed = yaml.load(readFileSync(configFile, 'utf8')) as DrAgentConfig | null;
    const rawEntries = [
      ...(parsed?.baseVolume?.allowedRepos ?? []),
      ...(parsed?.baseVolume?.allowlist ?? []),
    ];

    for (const rawEntry of rawEntries) {
      const p = entryPath(rawEntry);
      if (!p) continue;
      entries.push(normalizeAllowlistEntry(p));
    }
  }

  return { entries, files };
}

function isAllowed(repoRoot: string, entries: string[]): boolean {
  const normalizedRepoRoot = normalizePath(repoRoot);
  return entries.some(entry => matchesAllowlistEntry(entry, normalizedRepoRoot));
}

function configDisplay(files: string[]): string {
  if (files.length > 0) return files.map(f => `\`${f}\``).join(', ');
  const [firstDir] = configDirs();
  return `\`${path.join(firstDir, 'config.yaml')}\``;
}

export const baseVolumeRepoLocation: Rule = {
  id: 'base-volume-repo-location',
  severity: 'high',
  title: 'Git repo lives on the Mac mini base volume',
  description:
    'Working repos should not silently accumulate on the small internal/base volume. Move normal repos to the large external volume and keep only explicitly allowlisted repos on the base volume.',

  check(_files: ScannedFile[], ctx?: RuleContext): Finding[] {
    const scanRoot = ctx?.scanRoot ?? process.cwd();
    const repoRoot = findGitRoot(scanRoot);
    if (!repoRoot || !isOnBaseVolume(repoRoot)) return [];

    const { entries, files } = readAllowedRepos();
    if (isAllowed(repoRoot, entries)) return [];

    const configPathDisplay = configDisplay(files);

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
        `If this repo is intentionally allowed to remain on the base volume, add it to \`baseVolume.allowedRepos\` in ${configPathDisplay}.`,
        'Re-run `dr-agent run <repo> --rules base-volume-repo-location` and confirm the finding is gone only for allowlisted repos.',
      ],
      references: [
        'dna://flow/base-volume-repo-offload',
        'DR_AGENT_CONFIG_DIR or DR_AGENT_HOME',
        '~/.openclaw/.dr-agent/config.yaml',
      ],
      file: repoRoot,
    }];
  },
};
