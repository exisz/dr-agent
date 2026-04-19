#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, existsSync } from 'fs';
import { rules, getRuleById } from './rules/index.js';
import { collectFiles } from './scanner.js';
import { formatFindings } from './reporter.js';
import { loadConfig, DEFAULT_CONFIG_CONTENT } from './config.js';
import type { Severity, FailOn, Finding } from './types.js';

const program = new Command();

program
  .name('dr-agent')
  .description('Doctor for AI agent codebases — catches common pitfalls before they cost you days')
  .version('0.2.0');

program
  .command('run [path]')
  .description('Scan a codebase for known agent pitfalls (default: current directory)')
  .option('--json', 'Output results as JSON array')
  .option('--sarif', 'Output results as SARIF 2.1.0 (for GitHub code scanning)')
  .option('--severity <level>', 'Minimum severity to report (high|medium|low|info)', 'info')
  .option('--rules <ids>', 'Comma-separated rule IDs to run (default: all)')
  .option(
    '--fail-on <level>',
    'Exit 1 if issues at this severity or higher are found (high|medium|low|none)',
    'high'
  )
  .option('--no-fail', 'Never exit 1 (shortcut for --fail-on=none)')
  .action(
    (
      scanPath: string | undefined,
      opts: {
        json?: boolean;
        sarif?: boolean;
        severity?: string;
        rules?: string;
        failOn?: string;
        fail?: boolean;
      }
    ) => {
      const dir = scanPath ?? '.';

      // Load config (CLI flags > config file > defaults)
      const fileConfig = loadConfig(dir);

      const minSev = (opts.severity ?? fileConfig.failOn ?? 'info') as Severity;
      const ruleFilter = opts.rules?.split(',').map(r => r.trim());

      // --no-fail sets fail to false via commander's boolean negation
      const failOnRaw: FailOn =
        opts.fail === false
          ? 'none'
          : ((opts.failOn ?? fileConfig.failOn ?? 'high') as FailOn);

      const isMachineOutput = opts.json || opts.sarif;

      const sevOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

      const activeRules = rules.filter(r => {
        if (ruleFilter && !ruleFilter.includes(r.id)) return false;
        // Config rule overrides
        if (fileConfig.rules) {
          const cfgSev = fileConfig.rules[r.id];
          if (cfgSev === 'off') return false;
        }
        return true;
      });

      if (!isMachineOutput) {
        console.log(chalk.bold(`\n🩺 dr-agent scanning: ${dir}\n`));
      }

      const files = collectFiles(dir, fileConfig.ignorePaths);

      if (!isMachineOutput) {
        console.log(chalk.dim(`  ${files.length} files collected\n`));
      }

      let findings: Finding[] = [];
      for (const rule of activeRules) {
        findings = findings.concat(rule.check(files));
      }

      // Filter by severity
      findings = findings.filter(f => sevOrder[f.severity] <= sevOrder[minSev]);

      console.log(formatFindings(findings, opts.json ?? false, opts.sarif ?? false));

      // Exit code logic
      if (failOnRaw !== 'none') {
        const failThreshold = sevOrder[failOnRaw];
        const hasFailingIssue = findings.some(f => sevOrder[f.severity] <= failThreshold);
        if (hasFailingIssue) {
          process.exitCode = 1;
        }
      }
    }
  );

program
  .command('list-rules')
  .description('List all available rules with their severity')
  .option('--json', 'Output as JSON')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(
        JSON.stringify(
          rules.map(r => ({ id: r.id, severity: r.severity, title: r.title, description: r.description })),
          null,
          2
        )
      );
      return;
    }
    console.log(chalk.bold('\n🩺 dr-agent — Available Rules\n'));
    for (const r of rules) {
      const sevColor =
        r.severity === 'high' ? chalk.red : r.severity === 'medium' ? chalk.yellow : chalk.cyan;
      console.log(`  ${sevColor(`[${r.severity.toUpperCase()}]`)} ${chalk.bold(r.id)}`);
      console.log(`         ${r.title}`);
      console.log();
    }
  });

program
  .command('explain <rule-id>')
  .description('Print full explanation and fix for a rule')
  .action((ruleId: string) => {
    const rule = getRuleById(ruleId);
    if (!rule) {
      console.error(chalk.red(`Rule not found: ${ruleId}`));
      console.error(`Run ${chalk.bold('dr-agent list-rules')} to see available rules.`);
      process.exit(1);
    }
    console.log(chalk.bold(`\n🩺 ${rule.title}`));
    console.log(chalk.dim(`Rule ID: ${rule.id} | Severity: ${rule.severity}`));
    console.log(`\n${rule.description}\n`);
  });

program
  .command('init')
  .description('Create a default dr-agent.config.json in the current directory')
  .option('--force', 'Overwrite existing config file')
  .action((opts: { force?: boolean }) => {
    const configPath = 'dr-agent.config.json';
    if (existsSync(configPath) && !opts.force) {
      console.log(chalk.yellow(`⚠ ${configPath} already exists. Use --force to overwrite.`));
      process.exit(1);
    }
    writeFileSync(configPath, DEFAULT_CONFIG_CONTENT + '\n', 'utf-8');
    console.log(chalk.green(`✔ Created ${configPath}`));
    console.log(chalk.dim('  Edit it to tune rule severities, ignore paths, and fail-on threshold.'));
  });

program.parse();
