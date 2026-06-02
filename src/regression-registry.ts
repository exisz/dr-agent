import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

export type RegressionScope = 'workspace' | 'global';
export type RegressionSeverity = 'high' | 'medium' | 'low' | 'info';
export type RegressionAuditResult = 'passed' | 'failed';

export interface RegressionAuditRecord {
  auditedAt: string;
  result: RegressionAuditResult;
  note?: string;
}

export interface RegressionEntry {
  id: string;
  title: string;
  requirement: string;
  watch: string[];
  severity: RegressionSeverity;
  scope: RegressionScope;
  agent?: string;
  source?: string;
  createdAt: string;
  lastKnownRegressionAt?: string | null;
  stabilizedAt?: string | null;
  consecutiveCleanAudits: number;
  howToTest: string;
  command?: string;
  auditRecords: RegressionAuditRecord[];
}

export interface RegressionDb {
  schema: 'dr-agent.regression-watchlist.v1';
  entries: RegressionEntry[];
}

const STABILIZATION_CLEAN_AUDITS = 14;
const VALID_SEVERITIES = new Set<RegressionSeverity>(['high', 'medium', 'low', 'info']);

export function registryPath(scanDir: string, global: boolean): string {
  if (global) {
    return path.join(os.homedir(), '.openclaw', '.dr-agent', 'regressions.json');
  }
  return path.join(path.resolve(scanDir), '.dr-agent', 'regressions.json');
}

export function yamlRegistryPath(scanDir: string, global: boolean): string {
  const jsonPath = registryPath(scanDir, global);
  return jsonPath.replace(/\.json$/, '.yaml');
}

function normalizeDateLike(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const dateOnly = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSeverity(value: unknown): RegressionSeverity {
  const severity = typeof value === 'string' ? value.toLowerCase() : 'medium';
  return VALID_SEVERITIES.has(severity as RegressionSeverity) ? severity as RegressionSeverity : 'medium';
}

function normalizeAuditRecord(raw: unknown): RegressionAuditRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const auditedAt = typeof obj.auditedAt === 'string' ? obj.auditedAt : '';
  if (!auditedAt) return null;
  return {
    auditedAt,
    result: obj.result === 'failed' ? 'failed' : 'passed',
    ...(typeof obj.note === 'string' && obj.note ? { note: obj.note } : {}),
  };
}

function normalizeEntry(raw: unknown): RegressionEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id) return null;
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : id;
  const watch = Array.isArray(obj.watch)
    ? obj.watch.filter((w): w is string => typeof w === 'string' && !!w.trim())
    : [];
  const requirement = typeof obj.requirement === 'string' && obj.requirement.trim()
    ? obj.requirement.trim()
    : title;
  const howToTest = typeof obj.howToTest === 'string' && obj.howToTest.trim()
    ? obj.howToTest.trim()
    : watch.join(' | ');
  const auditRecords = Array.isArray(obj.auditRecords)
    ? obj.auditRecords.map(normalizeAuditRecord).filter((r): r is RegressionAuditRecord => r !== null)
    : [];

  return {
    id,
    title,
    requirement,
    watch,
    severity: normalizeSeverity(obj.severity),
    scope: obj.scope === 'global' ? 'global' : 'workspace',
    ...(typeof obj.agent === 'string' && obj.agent ? { agent: obj.agent } : {}),
    ...(typeof obj.source === 'string' && obj.source ? { source: obj.source } : {}),
    createdAt: typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : nowIso(),
    lastKnownRegressionAt: typeof obj.lastKnownRegressionAt === 'string' ? obj.lastKnownRegressionAt : null,
    stabilizedAt: typeof obj.stabilizedAt === 'string' ? obj.stabilizedAt : null,
    consecutiveCleanAudits: typeof obj.consecutiveCleanAudits === 'number' && Number.isFinite(obj.consecutiveCleanAudits)
      ? Math.max(0, Math.floor(obj.consecutiveCleanAudits))
      : 0,
    howToTest,
    ...(typeof obj.command === 'string' && obj.command ? { command: obj.command } : {}),
    auditRecords,
  };
}

function emptyDb(): RegressionDb {
  return { schema: 'dr-agent.regression-watchlist.v1', entries: [] };
}

function loadYamlRegistry(file: string): RegressionDb {
  const parsed = (yaml.load(fs.readFileSync(file, 'utf8')) as Record<string, unknown>) || {};
  const rawEntries = Array.isArray(parsed.regressions) ? parsed.regressions : Array.isArray(parsed.entries) ? parsed.entries : [];
  return {
    schema: 'dr-agent.regression-watchlist.v1',
    entries: rawEntries.map(normalizeEntry).filter((e): e is RegressionEntry => e !== null),
  };
}

export function loadRegistry(file: string): RegressionDb {
  if (!fs.existsSync(file)) {
    const yamlPath = file.replace(/\.json$/, '.yaml');
    if (fs.existsSync(yamlPath)) return loadYamlRegistry(yamlPath);
    return emptyDb();
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  if (parsed.schema !== 'dr-agent.regression-watchlist.v1' || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid regression registry: ${file}`);
  }
  return {
    schema: 'dr-agent.regression-watchlist.v1',
    entries: parsed.entries.map(normalizeEntry).filter((e): e is RegressionEntry => e !== null),
  };
}

export function saveRegistry(file: string, db: RegressionDb): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const normalized: RegressionDb = {
    schema: 'dr-agent.regression-watchlist.v1',
    entries: db.entries.map(normalizeEntry).filter((e): e is RegressionEntry => e !== null).sort((a, b) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'regression';
}

export function addRegression(file: string, entry: Omit<RegressionEntry, 'createdAt' | 'auditRecords' | 'consecutiveCleanAudits'> & { createdAt?: string; auditRecords?: RegressionAuditRecord[]; consecutiveCleanAudits?: number }): RegressionEntry {
  const db = loadRegistry(file);
  if (db.entries.some(e => e.id === entry.id)) {
    throw new Error(`Regression already exists: ${entry.id}`);
  }
  const full = normalizeEntry({
    ...entry,
    createdAt: normalizeDateLike(entry.createdAt, nowIso()),
    auditRecords: entry.auditRecords ?? [],
    consecutiveCleanAudits: entry.consecutiveCleanAudits ?? 0,
  });
  if (!full) throw new Error('Invalid regression entry');
  db.entries.push(full);
  saveRegistry(file, db);
  return full;
}

export function auditRegression(file: string, id: string, result: RegressionAuditResult, note?: string, at?: string): RegressionEntry {
  const db = loadRegistry(file);
  const entry = db.entries.find(e => e.id === id);
  if (!entry) throw new Error(`Regression not found: ${id}`);
  const auditedAt = normalizeDateLike(at, nowIso());
  entry.auditRecords.push({ auditedAt, result, ...(note ? { note } : {}) });
  if (result === 'failed') {
    entry.lastKnownRegressionAt = auditedAt;
    entry.consecutiveCleanAudits = 0;
    entry.stabilizedAt = null;
  } else {
    entry.consecutiveCleanAudits = (entry.consecutiveCleanAudits ?? 0) + 1;
    if (entry.consecutiveCleanAudits >= STABILIZATION_CLEAN_AUDITS && !entry.stabilizedAt) {
      entry.stabilizedAt = auditedAt;
    }
  }
  saveRegistry(file, db);
  return entry;
}

export function activeEntries(db: RegressionDb, includeStabilized = false): RegressionEntry[] {
  return db.entries.filter(entry => includeStabilized || !entry.stabilizedAt);
}
