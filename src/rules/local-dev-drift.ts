/**
 * local-dev-drift: Detect uncommitted changes or untracked files in repos
 * that are installed globally via npm link (local dev mode).
 *
 * This catches the insidious class of bug where local hacks work on the
 * development machine but break on any clean install (e.g. nvm reinstall,
 * new machine, CI). If a tool is running from a local repo (npm link),
 * ALL changes must be committed and ideally pushed.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

/** Known globally-linked tool repos to check */
const TOOL_REPOS = [
  { name: 'lazyjira', path: '/Users/c/repos/lazyjira' },
  { name: 'openclaw-extensions', path: '/Users/c/repos/nebula/openclaw-extensions' },
  { name: 'dr-agent', path: '/Users/c/repos/nebula/dr-agent' },
];

interface DriftInfo {
  repo: string;
  repoPath: string;
  uncommitted: string[];
  untracked: string[];
  unpushed: number;
}

function checkRepo(repoPath: string): DriftInfo | null {
  if (!existsSync(repoPath)) return null;

  try {
    // Check for uncommitted changes (staged + unstaged)
    const statusOutput = execSync('git status --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    const lines = statusOutput ? statusOutput.split('\n') : [];
    const uncommitted = lines.filter(l => !l.startsWith('??'));
    const untracked = lines.filter(l => l.startsWith('??')).map(l => l.slice(3));

    // Check for unpushed commits
    let unpushed = 0;
    try {
      const ahead = execSync('git rev-list --count @{u}..HEAD', {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      unpushed = parseInt(ahead, 10) || 0;
    } catch {
      // No upstream configured — that's fine
    }

    if (uncommitted.length === 0 && untracked.length === 0 && unpushed === 0) {
      return null; // Clean
    }

    return {
      repo: path.basename(repoPath),
      repoPath,
      uncommitted: uncommitted.map(l => l.trim()),
      untracked,
      unpushed,
    };
  } catch {
    return null; // Can't check — skip
  }
}

export const localDevDrift: Rule = {
  id: 'local-dev-drift',
  severity: 'high',
  title: 'Local tool repo out of sync with published version',
  description:
    'A globally-linked npm tool repo has uncommitted changes, untracked files, or unpushed commits. ' +
    'These local-only modifications work on this machine but will be lost on any clean install ' +
    '(nvm reinstall, new machine, CI). All changes must be committed and pushed.',

  check(_files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const tool of TOOL_REPOS) {
      const drift = checkRepo(tool.path);
      if (!drift) continue;

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

      findings.push({
        ruleId: 'local-dev-drift',
        severity: 'high',
        title: `[${tool.name}] ${parts.join('; ')}`,
        why:
          `The repo at ${drift.repoPath} has local-only changes that won't survive a clean install. ` +
          `This exact issue caused 6 audit cycles of false "tool missing" reports (HQ-1363) when ` +
          `openclaw-extensions had cron-investigate.ts as an untracked file.`,
        fix: [
          `cd ${drift.repoPath}`,
          `git add -A && git commit -m "fix: commit local changes"`,
          `git push`,
          `Then publish a new npm version if needed`,
        ],
        references: ['HQ-1363', 'HQ-1349'],
        file: drift.repoPath,
      });
    }

    return findings;
  },
};
