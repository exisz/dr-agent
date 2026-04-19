import chalk from 'chalk';
import type { Finding, Severity } from './types.js';

const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
  high: chalk.red.bold,
  medium: chalk.yellow.bold,
  low: chalk.cyan,
  info: chalk.gray,
};

const SEVERITY_ICON: Record<Severity, string> = {
  high: '✖',
  medium: '⚠',
  low: '→',
  info: 'ℹ',
};

export function formatFindings(findings: Finding[], asJson: boolean, asSarif?: boolean): string {
  if (asSarif) {
    return formatSarif(findings);
  }

  if (asJson) {
    const output = findings.map(f => ({
      ruleId: f.ruleId,
      severity: f.severity,
      file: f.file,
      line: f.line,
      column: f.column,
      message: f.message ?? f.title,
      fix: f.fix,
      references: f.references,
    }));
    return JSON.stringify(output, null, 2);
  }

  if (findings.length === 0) {
    return chalk.green('✔ No issues found. Your codebase looks healthy!');
  }

  const lines: string[] = [];
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  for (const f of sorted) {
    const icon = SEVERITY_ICON[f.severity];
    const colorFn = SEVERITY_COLOR[f.severity];
    lines.push('');
    lines.push(colorFn(`${icon} [${f.severity.toUpperCase()}] ${f.title}`));
    lines.push(chalk.dim(`  Rule: ${f.ruleId}`));
    if (f.file) lines.push(chalk.dim(`  File: ${f.file}${f.line ? `:${f.line}` : ''}`));
    lines.push('');
    lines.push(chalk.bold('  Why:'));
    for (const l of f.why.split('\n')) lines.push(`    ${l}`);
    lines.push('');
    lines.push(chalk.bold('  Fix:'));
    for (const fix of f.fix) {
      lines.push(`    • ${fix}`);
    }
    if (f.references.length) {
      lines.push('');
      lines.push(chalk.dim('  References:'));
      for (const ref of f.references) lines.push(chalk.dim(`    - ${ref}`));
    }
  }

  lines.push('');
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  const summary = Object.entries(counts)
    .map(([s, n]) => SEVERITY_COLOR[s as Severity](`${n} ${s}`))
    .join(', ');
  lines.push(chalk.bold(`Found ${findings.length} issue(s): ${summary}`));

  return lines.join('\n');
}

function formatSarif(findings: Finding[]): string {
  const rules = [...new Set(findings.map(f => f.ruleId))].map(id => {
    const f = findings.find(x => x.ruleId === id)!;
    return {
      id,
      name: id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
      shortDescription: { text: f.title },
      fullDescription: { text: f.why },
      helpUri: f.references[0] ?? 'https://github.com/exisz/dr-agent',
      defaultConfiguration: {
        level: f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
      },
    };
  });

  const results = findings.map(f => ({
    ruleId: f.ruleId,
    level: f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
    message: { text: f.message ?? f.title },
    locations: f.file
      ? [
          {
            physicalLocation: {
              artifactLocation: { uri: f.file, uriBaseId: '%SRCROOT%' },
              region: { startLine: f.line ?? 1, startColumn: f.column ?? 1 },
            },
          },
        ]
      : [],
  }));

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'dr-agent',
            version: '0.2.0',
            informationUri: 'https://github.com/exisz/dr-agent',
            rules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
