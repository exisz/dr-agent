import type { Finding, DrAgentConfig, Severity } from './types.js';
import { rules as allRules } from './rules/index.js';
import { collectFiles } from './scanner.js';

export interface RunRulesOptions {
  path?: string;
  rules?: string[];
  ignorePaths?: string[];
  minSeverity?: Severity;
}

/**
 * Programmatic API — run dr-agent rules against a path and return findings.
 *
 * @example
 * import { runRules } from 'dr-agent';
 * const issues = await runRules({ path: './src' });
 * console.log(issues);
 */
export async function runRules(opts: RunRulesOptions = {}): Promise<Finding[]> {
  const dir = opts.path ?? '.';
  const ruleFilter = opts.rules;
  const ignorePaths = opts.ignorePaths;

  const sevOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
  const minSev = opts.minSeverity ?? 'info';

  const activeRules = allRules.filter(r => !ruleFilter || ruleFilter.includes(r.id));
  const files = collectFiles(dir, ignorePaths);

  let findings: Finding[] = [];
  for (const rule of activeRules) {
    findings = findings.concat(rule.check(files));
  }

  return findings.filter(f => sevOrder[f.severity] <= sevOrder[minSev]);
}

export type { Finding, DrAgentConfig } from './types.js';
export { rules } from './rules/index.js';
