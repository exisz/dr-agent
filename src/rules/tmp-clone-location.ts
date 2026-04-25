// Rule: working repo lives under /tmp or /private/tmp
// Detects when an agent (or human) is doing real git work inside an
// ephemeral /tmp clone, which is one of the worst silent footguns:
//   - macOS / Linux periodically purge /tmp → uncommitted work vanishes
//   - git pack files frequently corrupt under partial purges
//   - subagents that auto-cd to /tmp/<project> bypass the canonical clone
//     and any agent rules attached to it
//
// If the scanned root looks like a git repo AND is under /tmp or
// /private/tmp, emit a HIGH finding telling the agent to move to
// the project's canonical clone (typically ~/dev/<project>) per its
// project DNA (`projects/<id>/<id>.dna.md` → "Repo" section).

import path from 'path';
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

function isUnderTmp(absPath: string): boolean {
  const norm = path.resolve(absPath);
  return (
    norm === '/tmp' ||
    norm === '/private/tmp' ||
    norm.startsWith('/tmp/') ||
    norm.startsWith('/private/tmp/')
  );
}

export const tmpCloneLocation: Rule = {
  id: 'tmp-clone-location',
  severity: 'high',
  title: 'Git repo lives under /tmp or /private/tmp (ephemeral clone)',
  description:
    'Doing real git work inside /tmp is a silent footgun: the OS periodically purges /tmp, git pack files corrupt, and any agent rules tied to the canonical clone are bypassed. Move work to the project\'s canonical local clone (e.g. ~/dev/<project>) listed in its project DNA file.',

  check(files: ScannedFile[], ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const scanRoot = ctx?.scanRoot ?? process.cwd();

    if (!isUnderTmp(scanRoot)) return findings;

    // Heuristic: looks like a real codebase (has package.json or .git config-ish
    // marker via files list — git dir itself is in SKIP_DIRS so we use sibling
    // signals).
    const looksLikeRepo = files.some(
      f => f.path === 'package.json' || f.path === 'pnpm-workspace.yaml' || f.path === 'turbo.json' || f.path.startsWith('apps/') || f.path.startsWith('packages/'),
    );
    if (!looksLikeRepo) return findings;

    // Try to guess project id from path basename.
    const guessedName = path.basename(scanRoot).replace(/^peopleclaw-?/, 'peopleclaw').replace(/-(rebuild|deploy|poc|refactor|fork|tmp|copy|clone)$/i, '');

    findings.push({
      ruleId: 'tmp-clone-location',
      severity: 'high',
      title: `Git repo at ${scanRoot} is under /tmp — move to canonical clone`,
      why:
        '/tmp and /private/tmp are ephemeral. macOS purges them periodically; git pack files corrupt; ' +
        'and any agent rules / env / hooks attached to the canonical clone are silently bypassed when ' +
        'an agent edits code from a stray /tmp clone.',
      fix: [
        'Stop work in this directory. DO NOT push from here.',
        `Find the project's canonical clone in its DNA: \`grep -n "Local clone\\|^- Local" projects/${guessedName}/${guessedName}.dna.md\` (typically \`~/dev/${guessedName}\`).`,
        'cd into the canonical clone, `git pull`, re-apply your changes there.',
        'Once verified, `rm -rf` this /tmp directory.',
        'If no canonical clone exists yet, create one: `git clone <repo> ~/dev/<project>` and record it in the project DNA `Repo` section.',
      ],
      references: [
        'https://docs.openclaw.ai/skills/dr-agent',
      ],
      file: scanRoot,
    });

    return findings;
  },
};
