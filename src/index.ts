#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { rules as builtinRules, getRuleById } from './rules/index.js';
import { loadDnaRules } from './rules/dna-rules.js';
import { collectFiles } from './scanner.js';
import { formatFindings } from './reporter.js';
import type { Severity, Finding, Rule } from './types.js';

const program = new Command();

program
  .name('dr-agent')
  .description('Doctor for AI agent codebases — catches common pitfalls before they cost you days')
  .version('0.1.0');

program
  .command('run [path]')
  .description('Scan a codebase for known agent pitfalls (default: current directory)')
  .option('--json', 'Output results as JSON')
  .option('--severity <level>', 'Minimum severity to report (high|medium|low|info)', 'info')
  .option('--rules <ids>', 'Comma-separated rule IDs to run (default: all)')
  .action(async (scanPath: string | undefined, opts: { json?: boolean; severity?: string; rules?: string }) => {
    const dir = scanPath ?? '.';
    const minSev = (opts.severity ?? 'info') as Severity;
    const ruleFilter = opts.rules?.split(',').map(r => r.trim());

    const sevOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

    // Merge builtin rules with rules derived from .dna shards (deprecated entries)
    const dnaRules: Rule[] = await loadDnaRules(dir);
    const allRules: Rule[] = [...builtinRules, ...dnaRules];
    const activeRules = allRules.filter(r => !ruleFilter || ruleFilter.includes(r.id));

    if (!opts.json) {
      console.log(chalk.bold(`\n🩺 dr-agent scanning: ${dir}\n`));
      if (dnaRules.length > 0) {
        console.log(chalk.dim(`  ${dnaRules.length} dna-derived rule(s) loaded from .dna/deprecated\n`));
      }
    }

    const files = collectFiles(dir);
    const path = await import('path');
    const ctx = { scanRoot: path.resolve(dir) };
    if (!opts.json) {
      console.log(chalk.dim(`  ${files.length} files collected\n`));
    }

    let findings: Finding[] = [];
    for (const rule of activeRules) {
      findings = findings.concat(rule.check(files, ctx));
    }

    // Filter by severity
    findings = findings.filter(f => sevOrder[f.severity] <= sevOrder[minSev]);

    console.log(formatFindings(findings, opts.json ?? false));

    if (!opts.json && findings.length > 0) {
      process.exitCode = 1;
    }

    // --- Fallow integration (always runs) ---
    const { execSync } = await import('child_process');
    const fallowCwd = path.resolve(dir);
    try {
      if (!opts.json) {
        console.log(chalk.bold('\n🔬 fallow codebase analysis\n'));
      }
      const fallowArgs = opts.json ? 'fallow --format json' : 'fallow';
      const result = execSync(`npx --yes ${fallowArgs}`, {
        cwd: fallowCwd,
        encoding: 'utf-8',
        stdio: opts.json ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
        timeout: 60_000,
      });
      if (opts.json && result) {
        // Merge fallow output into a wrapper
        try {
          const fallowData = JSON.parse(result);
          console.log(JSON.stringify({ fallow: fallowData }));
        } catch { console.log(result); }
      }
    } catch (e: any) {
      if (e.status) {
        if (opts.json && e.stdout) {
          try {
            const fallowData = JSON.parse(e.stdout);
            console.log(JSON.stringify({ fallow: fallowData }));
          } catch { console.log(e.stdout); }
        }
        // fallow findings exist — mark exit
        process.exitCode = 1;
      } else if (!opts.json) {
        console.log(chalk.dim('  fallow not available (install: npm i -g fallow)\n'));
      }
    }
  });

program
  .command('list-rules')
  .description('List all available rules with their severity')
  .option('--json', 'Output as JSON')
  .option('--scan-dir <dir>', 'Scan directory for .dna-derived rules (default: cwd)', '.')
  .action(async (opts: { json?: boolean; scanDir?: string }) => {
    const dnaRules: Rule[] = await loadDnaRules(opts.scanDir ?? '.');
    const all: Rule[] = [...builtinRules, ...dnaRules];
    if (opts.json) {
      console.log(JSON.stringify(all.map(r => ({ id: r.id, severity: r.severity, title: r.title, description: r.description })), null, 2));
      return;
    }
    console.log(chalk.bold('\n🩺 dr-agent — Available Rules\n'));
    for (const r of all) {
      const sevColor = r.severity === 'high' ? chalk.red : r.severity === 'medium' ? chalk.yellow : chalk.cyan;
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

program.parse();
