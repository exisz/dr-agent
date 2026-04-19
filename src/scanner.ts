import { readFileSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';
import type { ScannedFile } from './types.js';

const DEFAULT_SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];

export function collectFiles(dir: string, ignorePaths?: string[]): ScannedFile[] {
  const absDir = path.resolve(dir);
  const pattern = `**/*.{js,ts,jsx,tsx,mjs,cjs,env,json}`;

  const skipDirs = ignorePaths
    ? [...DEFAULT_SKIP_DIRS, ...ignorePaths.map(p => p.replace(/\*\*\//, '').replace('/**', ''))]
    : DEFAULT_SKIP_DIRS;

  const ignorePatterns = [
    ...DEFAULT_SKIP_DIRS.map(d => `**/${d}/**`),
    ...(ignorePaths ?? []),
  ];

  const filePaths = globSync(pattern, {
    cwd: absDir,
    absolute: true,
    ignore: ignorePatterns,
  });

  const results: ScannedFile[] = [];
  for (const fp of filePaths) {
    try {
      const content = readFileSync(fp, 'utf-8');
      results.push({
        path: fp,
        content,
        lines: content.split('\n'),
      });
    } catch {
      // skip unreadable files
    }
  }
  return results;
}
