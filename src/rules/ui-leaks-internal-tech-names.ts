// Rule: UI leaks internal technology names
//
// Detects when internal implementation names (e.g. "Logto") leak into
// user-facing UI text — buttons, links, labels. Users should see generic
// terms like "Sign in", "登录", "SSO Login" instead.

import type { Rule, Finding, ScannedFile } from '../types.js';

/** Internal tech names that should never appear in user-facing UI text. */
const LEAKED_NAMES = ['logto'];

/** File extensions to scan. */
const UI_EXTENSIONS = ['.tsx', '.jsx', '.html', '.astro', '.vue', '.svelte'];

/** Files to always skip (config/lib, not UI). */
const SKIP_PATTERNS = [
  /\.env/,
  /README\.md/i,
  /\/logto\.(ts|js|config\.\w+)$/,
  /\/auth\.(ts|js|config\.\w+)$/,
  /\.d\.ts$/,
];

/**
 * Check if a line is a comment or import (should be excluded).
 * Handles single-line comments, JSX comments, and import statements.
 */
function isExcludedLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) return true;
  if (trimmed.includes('require(')) return true;
  return false;
}

/**
 * Check if the match is inside a JSX comment.
 */
function isInsideJsxComment(line: string, matchIndex: number): boolean {
  const before = line.substring(0, matchIndex);
  const after = line.substring(matchIndex);
  // Check if we're between {/* and */}
  const commentStart = before.lastIndexOf('{/*');
  if (commentStart === -1) return false;
  const commentEndBefore = before.indexOf('*/}', commentStart);
  if (commentEndBefore !== -1) return false; // comment closed before our match
  const commentEndAfter = after.indexOf('*/}');
  return commentEndAfter !== -1;
}

export const uiLeaksInternalTechNames: Rule = {
  id: 'ui-leaks-internal-tech-names',
  severity: 'medium',
  title: 'Internal technology name leaked into user-facing UI',
  description:
    'Internal implementation names (e.g. "Logto") must not appear in user-facing buttons, links, or labels. ' +
    'Use generic terms like "Sign in", "登录", "SSO" instead.',

  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];

    const uiFiles = files.filter(f => {
      if (!UI_EXTENSIONS.some(ext => f.path.endsWith(ext))) return false;
      if (SKIP_PATTERNS.some(p => p.test(f.path))) return false;
      return true;
    });

    for (const file of uiFiles) {
      const hits: Array<{ line: number; text: string; name: string }> = [];

      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];
        if (isExcludedLine(line)) continue;

        for (const name of LEAKED_NAMES) {
          const re = new RegExp(name, 'gi');
          let m: RegExpExecArray | null;
          while ((m = re.exec(line)) !== null) {
            if (isInsideJsxComment(line, m.index)) continue;

            // Check if it's in a string literal or JSX text content (not a variable/prop name)
            // Look for: "...Name...", '...Name...', `...Name...`, or >...Name...<
            const before = line.substring(0, m.index);
            const after = line.substring(m.index + name.length);

            const inString =
              // Inside a quoted string
              (before.match(/["'`][^"'`]*$/) && after.match(/^[^"'`]*["'`]/)) ||
              // Inside JSX text content (between > and <)
              (before.match(/>\s*[^<]*$/) && after.match(/^[^>]*\s*</));

            if (inString) {
              hits.push({ line: i + 1, text: line.trim(), name: m[0] });
            }
          }
        }
      }

      if (hits.length > 0) {
        const details = hits
          .map(h => `  Line ${h.line}: "${h.name}" found in: ${h.text}`)
          .join('\n');

        findings.push({
          ruleId: 'ui-leaks-internal-tech-names',
          severity: 'medium',
          title: `Internal tech name leaked in UI: ${file.path} (${hits.length} occurrence${hits.length > 1 ? 's' : ''})`,
          why:
            'User-facing UI should never expose internal implementation details. ' +
            'Showing "Logto" in a login button confuses users and leaks your auth stack.\n\n' +
            details,
          fix: [
            'Replace "Login with Logto" → "Sign in" or "登录"',
            'Replace "Sign in with Logto" → "Sign in" or "SSO Login"',
            'Replace "使用Logto登录" → "登录" or "SSO登录"',
            'Keep internal names only in config files, env vars, and code comments.',
          ],
          references: [],
          file: file.path,
          line: hits[0].line,
        });
      }
    }

    return findings;
  },
};
