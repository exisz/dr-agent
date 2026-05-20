/**
 * local-dev-drift: Detect uncommitted changes in the *current scanned repo*
 * only when that repo is installed globally via npm link.
 *
 * This must be context-aware. Older versions checked a hardcoded list of
 * empire tool repos no matter which project was being scanned, so running
 * `dr-agent` inside any unrelated project reported global/local machine state.
 */
import { execSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

interface DriftInfo {
  repo: string;
  repoPath: string;
  uncommitted: string[];
  untracked: string[];
  unpushed: number;
}

function packageName(files: ScannedFile[]): string | null {
  const pkg = files.find(f => f.path === 'package.json');
  if (!pkg) return null;

  try {
    const parsed = JSON.parse(pkg.content);
    return typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null;
  } catch {
    return null;
  }
}

function linkedPackagePath(name: string): string | null {
  try {
    const root = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (!root) return null;

    const packagePath = path.join(root, ...name.split('/'));
    if (!existsSync(packagePath)) return null;
    return realpathSync(packagePath);
  } catch {
    return null;
  }
}

function isCurrentRepoGloballyLinked(scanRoot: string, files: ScannedFile[]): boolean {
  const name = packageName(files);
  if (!name) return false;

  const linkedPath = linkedPackagePath(name);
  if (!linkedPath) return false;

  try {
    return realpathSync(scanRoot) === linkedPath;
  } catch {
    return false;
  }
}

function checkRepo(repoPath: string): DriftInfo | null {
  if (!existsSync(repoPath)) return null;

  try {
    const statusOutput = execSync('git status --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    const lines = statusOutput ? statusOutput.split('\n') : [];
    const uncommitted = lines.filter(l => !l.startsWith('??'));
    const untracked = lines.filter(l => l.startsWith('??')).map(l => l.slice(3));

    let unpushed = 0;
    try {
      const ahead = execSync('git rev-list --count @{u}..HEAD', {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      unpushed = parseInt(ahead, 10) || 0;
    } catch {
      // No upstream configured — skip the unpushed check.
    }

    if (uncommitted.length === 0 && untracked.length === 0 && unpushed === 0) {
      return null;
    }

    return {
      repo: path.basename(repoPath),
      repoPath,
      uncommitted: uncommitted.map(l => l.trim()),
      untracked,
      unpushed,
    };
  } catch {
    return null;
  }
}

export const localDevDrift: Rule = {
  id: 'local-dev-drift',
  severity: 'high',
  title: 'Current npm-linked tool repo is out of sync with published version',
  description:
    'When the current scanned repo is installed globally via npm link, detect uncommitted changes, ' +
    'untracked files, or unpushed commits. This rule is intentionally scoped to the current repo; ' +
    'it must not report unrelated global machine state.',

  check(files: ScannedFile[], ctx?: RuleContext): Finding[] {
    const scanRoot = path.resolve(ctx?.scanRoot ?? process.cwd());
    if (!isCurrentRepoGloballyLinked(scanRoot, files)) return [];

    const drift = checkRepo(scanRoot);
    if (!drift) return [];

    const parts: string[] = [];
    if (drift.untracked.length > 0) {
      parts.push(`${drift.untracked.length} untracked file(s): ${drift.untracked.slice(0, 5).join(', ')}`);
    }
    if (drift.uncommitted.length > 0) {
      parts.push(`${drift.uncommitted.length} uncommitted change(s)`);
    }
    if (drift.unpushed > 0) {
      parts.push(`${drift.unpushed} unpushed commit(s)`);
    }

    return [{
      ruleId: 'local-dev-drift',
      severity: 'high',
      title: `[${drift.repo}] ${parts.join('; ')}`,
      why:
        `The scanned repo at ${drift.repoPath} is globally linked via npm and has local-only changes. ` +
        'Those changes can make the tool appear fixed on this machine while clean installs, CI, or other machines still run the published version.',
      fix: [
        `cd ${drift.repoPath}`,
        'git add -A && git commit -m "fix: commit local changes"',
        'git push',
        'Publish a new npm version if the globally consumed package needs the fix.',
      ],
      references: ['HQ-1363', 'HQ-1349', 'Issue #5'],
      file: drift.repoPath,
    }];
  },
};
