/**
 * gh-projectv2-options-overwrite: Detect dangerous use of GitHub
 * `updateProjectV2Field` mutation with `singleSelectOptions:` payload.
 *
 * The `singleSelectOptions` array on `updateProjectV2Field` is a FULL REWRITE
 * of the field's options — passing it generates fresh option IDs for every
 * option, which silently NULLS the field value on every existing project item
 * that referenced an old option ID.
 *
 * Real incident (2026-05-03): removing the "Epic" option from Nebula GitHub
 * Project #8 by sending the remaining 3 options through this mutation wiped
 * the Type field on all 90 items in the board. Recovery required scripted
 * heuristic re-classification.
 *
 * Safer alternatives:
 *   - To DELETE one option: accept the field-value loss, snapshot all current
 *     (item_id, option_name) pairs first, then re-apply after the rewrite.
 *   - To ADD an option: include ALL current options with their existing IDs
 *     (id field) plus the new one — IDs are preserved when supplied.
 *   - Avoid this mutation entirely from automation; perform option edits in
 *     the GitHub UI which uses targeted single-option mutations.
 */
import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

const TRIGGER = /updateProjectV2Field/;
const PAYLOAD = /singleSelectOptions\s*:/;

export const ghProjectv2OptionsOverwrite: Rule = {
  id: 'gh-projectv2-options-overwrite',
  severity: 'high',
  title: 'Dangerous GitHub updateProjectV2Field singleSelectOptions rewrite',
  description:
    'Detects scripts/snippets that call the GitHub GraphQL `updateProjectV2Field` ' +
    'mutation with a `singleSelectOptions:` payload. This payload is a full rewrite ' +
    'and will silently null the field value on every existing project item.',

  check(files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of files) {
      // Scan source-ish files: shell, JS/TS, Python, Markdown code samples
      const ext = file.path.toLowerCase();
      if (
        !ext.endsWith('.sh') &&
        !ext.endsWith('.bash') &&
        !ext.endsWith('.zsh') &&
        !ext.endsWith('.js') &&
        !ext.endsWith('.mjs') &&
        !ext.endsWith('.cjs') &&
        !ext.endsWith('.ts') &&
        !ext.endsWith('.tsx') &&
        !ext.endsWith('.py') &&
        !ext.endsWith('.md') &&
        !ext.endsWith('.graphql')
      ) {
        continue;
      }

      // Need the trigger somewhere in the file
      const joined = file.lines.join('\n');
      if (!TRIGGER.test(joined) || !PAYLOAD.test(joined)) continue;

      // Pinpoint each line that mentions singleSelectOptions in a file that
      // also references updateProjectV2Field
      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];
        if (!PAYLOAD.test(line)) continue;
        findings.push({
          ruleId: 'gh-projectv2-options-overwrite',
          severity: 'high',
          title: 'updateProjectV2Field singleSelectOptions is a full rewrite',
          why:
            'Passing `singleSelectOptions:` to `updateProjectV2Field` regenerates ' +
            'option IDs for every option, silently nulling the single-select field ' +
            'value on every existing project item. Real incident wiped 90 items.',
          fix: [
            'To ADD an option: include ALL current options WITH their existing ids in the payload.',
            'To REMOVE an option: snapshot (item_id, option_name) pairs first, then re-apply after rewrite.',
            'Prefer GitHub UI for one-off option edits; never automate full-rewrite blindly.',
          ],
          references: [
            'Nebula incident 2026-05-03 (DNA thread): wiped Type field on 90 items',
          ],
          file: file.path,
          line: i + 1,
        });
      }
    }

    return findings;
  },
};
