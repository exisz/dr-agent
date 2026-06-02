import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type RegressionScope = 'workspace' | 'global';

export interface RegressionEntry {
  id: string;
  title: string;
  requirement: string;
  watch: string[];
  severity: 'high' | 'medium' | 'low' | 'info';
  scope: RegressionScope;
  agent?: string;
  source?: string;
  createdAt: string;
}

export interface RegressionDb {
  schema: 'dr-agent.regression-watchlist.v1';
  entries: RegressionEntry[];
}

export function registryPath(scanDir: string, global: boolean): string {
  if (global) {
    return path.join(os.homedir(), '.openclaw', '.dr-agent', 'regressions.json');
  }
  return path.join(path.resolve(scanDir), '.dr-agent', 'regressions.json');
}

export function loadRegistry(file: string): RegressionDb {
  if (!fs.existsSync(file)) {
    return { schema: 'dr-agent.regression-watchlist.v1', entries: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as RegressionDb;
  if (parsed.schema !== 'dr-agent.regression-watchlist.v1' || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid regression registry: ${file}`);
  }
  return parsed;
}

export function saveRegistry(file: string, db: RegressionDb): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(db, null, 2)}\n`);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'regression';
}

export function addRegression(file: string, entry: Omit<RegressionEntry, 'createdAt'> & { createdAt?: string }): RegressionEntry {
  const db = loadRegistry(file);
  if (db.entries.some(e => e.id === entry.id)) {
    throw new Error(`Regression already exists: ${entry.id}`);
  }
  const full: RegressionEntry = {
    ...entry,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  db.entries.push(full);
  db.entries.sort((a, b) => a.id.localeCompare(b.id));
  saveRegistry(file, db);
  return full;
}
