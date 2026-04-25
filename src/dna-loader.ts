/**
 * dna-loader: discovers `.dna` files (deprecated entries) on disk and parses
 * their YAML metadata. Used by `src/rules/dna-rules.ts` to produce dr-agent
 * Rules from declarative DNA `deprecated` shards.
 *
 * Convention: deprecated DNA shards live alongside an optional `.ts` companion
 * file with the same basename. The `.ts` file (if present) exports a Rule.
 * The `.dna` metadata is then injected into Findings produced by that rule.
 *
 * Discovery roots:
 *   1. `<scanRoot>/.dna/deprecated/` (per-repo overrides)
 *   2. `~/.openclaw/.dna/deprecated/` (global / fleet-wide)
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import yaml from 'js-yaml';
import type { Severity } from './types.js';

export interface DnaDeprecated {
  /** Canonical id, e.g. dna://deprecated/no-next-auth */
  id: string;
  /** Short slug derived from filename, e.g. no-next-auth */
  slug: string;
  severity: Severity;
  /** Pattern field — used as the rule title when no .ts companion exists */
  title: string;
  /** Reason field — used as description / why */
  description: string;
  replacement: string;
  since: string;
  /** Absolute path to the source .dna file (for traceability) */
  sourcePath: string;
  /** Absolute path to a co-located .ts companion file, if one exists */
  companionTsPath?: string;
  /** Optional list of reference URLs from frontmatter */
  references?: string[];
}

const VALID_SEVERITIES: ReadonlyArray<Severity> = ['high', 'medium', 'low', 'info'];

function coerceSeverity(value: unknown, fallback: Severity = 'medium'): Severity {
  if (typeof value !== 'string') return fallback;
  const lower = value.toLowerCase() as Severity;
  return VALID_SEVERITIES.includes(lower) ? lower : fallback;
}

function deriveSlug(filename: string): string {
  return filename.replace(/\.dna$/, '');
}

function parseDnaFile(filePath: string): DnaDeprecated | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  // Support both pure YAML and YAML frontmatter (between leading `---` markers).
  let yamlText = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) yamlText = raw.slice(3, end);
  }

  let fields: Record<string, unknown>;
  try {
    fields = (yaml.load(yamlText) as Record<string, unknown>) || {};
  } catch {
    return null;
  }

  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  if (fields.type !== 'deprecated') return null;

  const slug = deriveSlug(path.basename(filePath));
  const id = typeof fields.id === 'string' ? fields.id : `dna://deprecated/${slug}`;

  const dirName = path.dirname(filePath);
  const companionTs = path.join(dirName, `${slug}.ts`);
  const companionTsPath = existsSync(companionTs) ? companionTs : undefined;

  const refs = Array.isArray(fields.references)
    ? (fields.references as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;

  return {
    id,
    slug,
    severity: coerceSeverity(fields.severity, 'medium'),
    title: typeof fields.pattern === 'string' ? fields.pattern : slug,
    description: typeof fields.reason === 'string' ? fields.reason : '',
    replacement: typeof fields.replacement === 'string' ? fields.replacement : '',
    since: typeof fields.since === 'string'
      ? fields.since
      : (fields.since instanceof Date ? fields.since.toISOString().slice(0, 10) : ''),
    sourcePath: filePath,
    companionTsPath,
    references: refs,
  };
}

function scanDir(dir: string): DnaDeprecated[] {
  if (!existsSync(dir)) return [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: DnaDeprecated[] = [];
  for (const name of entries) {
    if (!name.endsWith('.dna')) continue;
    const full = path.join(dir, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    const parsed = parseDnaFile(full);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Load all deprecated DNA entries visible from a scan root.
 * Looks in <scanDir>/.dna/deprecated and ~/.openclaw/.dna/deprecated.
 * Per-repo entries take precedence (by id) over global ones.
 */
export function loadDnaDeprecated(scanDir: string): DnaDeprecated[] {
  const localDir = path.join(path.resolve(scanDir), '.dna', 'deprecated');
  const globalDir = path.join(homedir(), '.openclaw', '.dna', 'deprecated');

  const local = scanDir ? scanDirHelper(localDir) : [];
  const global = scanDirHelper(globalDir);

  // Local overrides global by id
  const byId = new Map<string, DnaDeprecated>();
  for (const entry of global) byId.set(entry.id, entry);
  for (const entry of local) byId.set(entry.id, entry);
  return [...byId.values()];
}

// Re-exported helper so loadDnaDeprecated is the only public entry point.
function scanDirHelper(dir: string): DnaDeprecated[] {
  return scanDir(dir);
}
