/**
 * gog-gmail-wrong-syntax: Detect incorrect gog Gmail CLI syntax in .md files.
 *
 * Common hallucinated patterns:
 * - `gog gmail messages search --query "X"` → should be `gog gmail messages search "X"`
 * - `gog gmail messages read {id}` → should be `gog gmail get {id}`
 *
 * Source: HQ-1220
 */
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

const WRONG_SEARCH = /gog\s+gmail\s+messages\s+search\s+--query\s+/;
const WRONG_READ = /gog\s+gmail\s+messages\s+read\s+/;

export const gogGmailWrongSyntax: Rule = {
  id: 'gog-gmail-wrong-syntax',
  severity: 'medium',
  title: 'Incorrect gog Gmail CLI syntax',
  description:
    'Detects hallucinated gog CLI syntax in Markdown files. ' +
    'The --query flag does not exist on `gog gmail messages search`, and ' +
    '`gog gmail messages read` should be `gog gmail get`.',

  check(files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.path.endsWith('.md')) continue;

      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];

        if (WRONG_SEARCH.test(line)) {
          findings.push({
            ruleId: 'gog-gmail-wrong-syntax',
            severity: 'medium',
            title: 'Wrong gog search syntax: --query flag does not exist',
            why:
              'The gog CLI does not accept --query on `gmail messages search`. ' +
              'The search term is a positional argument: `gog gmail messages search "term"`.',
            fix: [
              'Replace `gog gmail messages search --query "X"` with `gog gmail messages search "X"`',
            ],
            references: ['HQ-1220'],
            file: file.path,
            line: i + 1,
          });
        }

        if (WRONG_READ.test(line)) {
          findings.push({
            ruleId: 'gog-gmail-wrong-syntax',
            severity: 'medium',
            title: 'Wrong gog read syntax: use `gog gmail get` instead',
            why:
              'The subcommand `gog gmail messages read` does not exist. ' +
              'To read a message by ID, use `gog gmail get {id}`.',
            fix: [
              'Replace `gog gmail messages read {id}` with `gog gmail get {id}`',
            ],
            references: ['HQ-1220'],
            file: file.path,
            line: i + 1,
          });
        }
      }
    }

    return findings;
  },
};
