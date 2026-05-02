/**
 * jira-phantom-project: Detect references to non-existent Jira project keys
 * in CRON_ENTRYPOINT or pod instruction files.
 *
 * Known phantom projects: NEBULA (does not exist in Jira).
 * Agents hallucinate project keys and hardcode them into automated entrypoints,
 * causing silent failures when lazyjira/lin tries to create issues.
 *
 * Source: HQ-1374
 */
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

/** Project keys known to NOT exist in Jira */
const PHANTOM_PROJECTS = ['NEBULA'];

function buildPattern(project: string): RegExp {
  return new RegExp(`(lin|lazyjira)\\b.*\\b${project}\\b`, 'i');
}

export const jiraPhantomProject: Rule = {
  id: 'jira-phantom-project',
  severity: 'high',
  title: 'Reference to non-existent Jira project key',
  description:
    'Detects Markdown files that reference Jira project keys known not to exist. ' +
    'Agents hallucinate project keys (e.g. NEBULA) and hardcode them into cron entrypoints, ' +
    'causing lazyjira/lin commands to fail silently.',

  check(files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.path.endsWith('.md')) continue;

      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];

        for (const project of PHANTOM_PROJECTS) {
          const pattern = buildPattern(project);
          if (pattern.test(line)) {
            findings.push({
              ruleId: 'jira-phantom-project',
              severity: 'high',
              title: `Phantom Jira project "${project}" referenced`,
              why:
                `The Jira project "${project}" does not exist. This will cause lazyjira/lin ` +
                `commands to fail. Verify the correct project key before hardcoding it in entrypoints.`,
              fix: [
                `Remove or replace the "${project}" project key with a valid one.`,
                'Run `lazyjira projects list` to see available project keys.',
              ],
              references: ['HQ-1374'],
              file: file.path,
              line: i + 1,
            });
          }
        }
      }
    }

    return findings;
  },
};
