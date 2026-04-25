import { readFileSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';
import type { ScannedFile } from './types.js';

const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];

export function collectFiles(dir: string): ScannedFile[] {
  const absDir = path.resolve(dir);
  const pattern = `**/*.{js,ts,jsx,tsx,mjs,cjs,env,json,yaml,yml,css,scss,less}`;

  const filePaths = globSync(pattern, {
    cwd: absDir,
    absolute: false,
    ignore: SKIP_DIRS.map(d => `**/${d}/**`),
  });

  const results: ScannedFile[] = [];
  for (const rel of filePaths) {
    const fp = path.join(absDir, rel);
    try {
      const content = readFileSync(fp, 'utf-8');
      results.push({
        // Keep path relative to the scanned root so rules can match by repo-relative paths.
        path: rel,
        content,
        lines: content.split('\n'),
      });
    } catch {
      // skip unreadable files
    }
  }
  return results;
}
