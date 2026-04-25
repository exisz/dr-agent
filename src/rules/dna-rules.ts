/**
 * dna-rules: turn DNA deprecated shards into dr-agent Rules.
 *
 * For each `.dna` file with `type: deprecated`:
 *   - If a co-located `.ts` companion exists, dynamically import it and use
 *     the exported Rule's `check` logic, but enrich every Finding with the
 *     metadata from the `.dna` file (replacement, since, references).
 *   - If no companion exists, synthesize a simple substring/grep-based Rule
 *     from the `pattern` field (best-effort; declaration-only entries are
 *     useful documentation even without a check).
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { existsSync } from 'fs';
import type { Rule, Finding, ScannedFile, Severity } from '../types.js';
import { loadDnaDeprecated, type DnaDeprecated } from '../dna-loader.js';

/** Build a "Why" message from DNA metadata. */
function buildWhy(entry: DnaDeprecated): string {
  const parts: string[] = [];
  if (entry.description) parts.push(entry.description);
  if (entry.since) parts.push(`Deprecated since ${entry.since}.`);
  return parts.join(' ');
}

/** Build a "Fix" array from DNA metadata. */
function buildFix(entry: DnaDeprecated): string[] {
  const fix: string[] = [];
  if (entry.replacement) fix.push(`Replace with: ${entry.replacement}`);
  fix.push(`See DNA entry: ${entry.id}`);
  return fix;
}

/** Build a default references array from DNA metadata. */
function buildReferences(entry: DnaDeprecated): string[] {
  const refs: string[] = [];
  if (entry.references && entry.references.length) refs.push(...entry.references);
  refs.push(`DNA: ${entry.id} (${entry.sourcePath})`);
  return refs;
}

/**
 * Wrap a companion Rule so every Finding it produces is enriched with metadata
 * from the DNA shard. Companion Findings keep their own `why`/`fix`/`references`
 * but get `replacement`/`since` appended where missing.
 */
function wrapCompanionRule(companion: Rule, entry: DnaDeprecated): Rule {
  return {
    id: companion.id || entry.slug,
    severity: companion.severity || entry.severity,
    title: companion.title || entry.title,
    description: companion.description || entry.description,
    check(files: ScannedFile[]): Finding[] {
      const findings = companion.check(files) || [];
      return findings.map(f => {
        const enrichedFix = [...(f.fix || [])];
        if (entry.replacement && !enrichedFix.some(s => s.includes(entry.replacement))) {
          enrichedFix.push(`DNA replacement: ${entry.replacement}`);
        }
        const enrichedRefs = [...(f.references || [])];
        const dnaRef = `DNA: ${entry.id}`;
        if (!enrichedRefs.some(r => r.includes(entry.id))) {
          enrichedRefs.push(dnaRef);
        }
        const sinceSuffix = entry.since && !(f.why || '').includes(entry.since)
          ? ` (deprecated since ${entry.since})`
          : '';
        return {
          ...f,
          why: (f.why || '') + sinceSuffix,
          fix: enrichedFix,
          references: enrichedRefs,
        };
      });
    },
  };
}

/**
 * Synthesize a grep-based Rule from a DNA `pattern` string. The pattern is
 * split on `/` and `,`; each non-empty fragment becomes a substring needle.
 * This is intentionally simple — for richer detection, ship a `.ts` companion.
 */
function synthesizeGrepRule(entry: DnaDeprecated): Rule | null {
  const needles = entry.title
    .split(/[\/,]/)
    .map(s => s.trim())
    .filter(s => s.length >= 3 && !/\s/.test(s));
  if (needles.length === 0) return null;

  return {
    id: entry.slug,
    severity: entry.severity,
    title: `Deprecated: ${entry.title}`,
    description: entry.description,
    check(files: ScannedFile[]): Finding[] {
      const findings: Finding[] = [];
      for (const f of files) {
        for (let i = 0; i < f.lines.length; i++) {
          const line = f.lines[i];
          for (const needle of needles) {
            if (line.includes(needle)) {
              findings.push({
                ruleId: entry.slug,
                severity: entry.severity,
                title: `Deprecated: ${entry.title}`,
                why: buildWhy(entry),
                fix: buildFix(entry),
                references: buildReferences(entry),
                file: f.path,
                line: i + 1,
              });
              break; // one finding per line
            }
          }
        }
      }
      return findings;
    },
  };
}

/**
 * Dynamically import a companion .ts file and return its default-exported Rule.
 * Returns null if the import fails or the default export is not a Rule.
 *
 * NOTE: requires the companion file to be loadable as ESM. In production
 * (compiled `dist/`), companion files would typically be .js. We attempt the
 * raw path first and fall back to a `.js` sibling if available.
 */
async function loadCompanionRule(tsPath: string): Promise<Rule | null> {
  const candidates: string[] = [];
  candidates.push(tsPath);
  // Allow a pre-compiled .js sibling (for environments without on-the-fly TS)
  const jsSibling = tsPath.replace(/\.ts$/, '.js');
  if (jsSibling !== tsPath && existsSync(jsSibling)) candidates.unshift(jsSibling);

  for (const candidate of candidates) {
    try {
      const url = pathToFileURL(candidate).href;
      const mod = await import(url);
      const exported = (mod && (mod.default ?? mod.rule)) as Rule | undefined;
      if (
        exported &&
        typeof exported === 'object' &&
        typeof (exported as Rule).check === 'function'
      ) {
        return exported as Rule;
      }
    } catch {
      // Try the next candidate
    }
  }
  return null;
}

/**
 * Public entry point: discover deprecated DNA shards and return a Rule[] ready
 * to merge with the builtin ruleset.
 */
export async function loadDnaRules(scanDir: string): Promise<Rule[]> {
  const entries = loadDnaDeprecated(scanDir);
  const rules: Rule[] = [];

  for (const entry of entries) {
    if (entry.companionTsPath) {
      const companion = await loadCompanionRule(entry.companionTsPath);
      if (companion) {
        rules.push(wrapCompanionRule(companion, entry));
        continue;
      }
      // Companion present but unloadable — fall through to grep-based fallback
      // so the entry still contributes coverage rather than silently dropping.
    }
    const grep = synthesizeGrepRule(entry);
    if (grep) rules.push(grep);
    // entries with no usable check (no companion + unparseable pattern) are
    // skipped silently — they exist as documentation only.
  }

  return rules;
}

// Re-export the metadata type for downstream consumers
export type { DnaDeprecated } from '../dna-loader.js';

// Suppress unused-import warning
void ({} as Severity);
