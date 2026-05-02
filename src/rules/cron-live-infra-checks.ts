/**
 * cron-live-infra-checks: Detect cron entrypoints that include live
 * infrastructure health checks (curl, ping, web_fetch to production URLs).
 *
 * These block/timeout and waste cron budget. Crons should use status APIs
 * or skip live checks entirely.
 *
 * Source: HQ-1391, HQ-1383
 */
import path from 'node:path';
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

const PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /curl\s+https?:\/\//, label: 'curl to external URL' },
  { pattern: /web_fetch\b/, label: 'web_fetch call' },
  { pattern: /ping\s+\S/, label: 'ping command' },
];

function isCronEntrypoint(filePath: string): boolean {
  const base = path.basename(filePath);
  return base.startsWith('CRON_ENTRYPOINT') && base.endsWith('.md');
}

export const cronLiveInfraChecks: Rule = {
  id: 'cron-live-infra-checks',
  severity: 'medium',
  title: 'Cron entrypoint includes live infrastructure checks',
  description:
    'Detects CRON_ENTRYPOINT*.md files that instruct agents to run curl, ping, or web_fetch ' +
    'against production URLs. These block, timeout, and waste budget. ' +
    'Use status APIs or remove live checks from cron flows.',

  check(files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!isCronEntrypoint(file.path)) continue;

      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];

        for (const { pattern, label } of PATTERNS) {
          if (pattern.test(line)) {
            findings.push({
              ruleId: 'cron-live-infra-checks',
              severity: 'medium',
              title: `Live infra check in cron entrypoint: ${label}`,
              why:
                'Live infrastructure checks (curl, ping, web_fetch) in cron entrypoints ' +
                'block execution, timeout unpredictably, and waste cron budget. ' +
                'They should be removed or replaced with lightweight status API calls.',
              fix: [
                'Remove the live infra check from the cron entrypoint.',
                'If health monitoring is needed, use a dedicated monitoring service or status API.',
              ],
              references: ['HQ-1391', 'HQ-1383'],
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
