// Rule: Small tap targets / icons in mobile UI code
//
// AI-generated mobile UIs consistently produce undersized interactive elements:
//   - Icons with width/height < 20px
//   - Tap targets (buttons, clickable elements) below 44x44px (Apple HIG)
//   - Font-size on interactive elements below 14px
//
// Scans TSX/JSX and CSS for these patterns.

import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

interface SizeIssue {
  line: number;
  file: string;
  detail: string;
}

export const smallTapTargets: Rule = {
  id: 'small-tap-targets',
  severity: 'medium',
  title: 'Small tap targets / icons in mobile UI (Apple HIG: minimum 44×44px)',
  description:
    'AI-generated mobile UIs consistently produce undersized interactive elements. ' +
    'Apple HIG requires 44×44pt minimum tap targets. Icons below 20px are hard to see. ' +
    'This rule checks CSS and components for undersized interactive elements.',

  check(files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const issues: SizeIssue[] = [];

    // ─── CSS checks ───
    const cssFiles = files.filter(
      f => f.path.endsWith('.css') || f.path.endsWith('.scss'),
    );

    for (const file of cssFiles) {
      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];
        const lineNum = i + 1;

        // Check: width/height on likely-interactive elements with values < 32px
        // Pattern: width: Npx or height: Npx where N < 32 (but > 0)
        // We only flag when a small size is combined with cursor:pointer or
        // the class name suggests interactivity (btn, toggle, icon, action, click)
        const sizeMatch = line.match(/(?:width|height)\s*:\s*(\d+)px/);
        if (sizeMatch) {
          const px = parseInt(sizeMatch[1], 10);
          if (px > 0 && px < 32) {
            // Look backward up to 10 lines for a selector that implies interactivity
            const context = file.lines.slice(Math.max(0, i - 10), i + 1).join(' ');
            if (/cursor\s*:\s*pointer|\..*(?:btn|button|toggle|action|click|tap|icon|close|delete|remove|nav|tab)/i.test(context)) {
              issues.push({
                line: lineNum,
                file: file.path,
                detail: `Interactive element ${sizeMatch[0]} — below 44px Apple HIG minimum tap target. Users will misclick on mobile.`,
              });
            }
          }
        }

        // Check: font-size on interactive-looking elements < 12px
        const fontMatch = line.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/);
        if (fontMatch) {
          const px = parseFloat(fontMatch[1]);
          if (px > 0 && px < 11) {
            const context = file.lines.slice(Math.max(0, i - 10), i + 1).join(' ');
            if (/cursor\s*:\s*pointer|\..*(?:btn|button|card|action|right|status|badge|chip)/i.test(context)) {
              issues.push({
                line: lineNum,
                file: file.path,
                detail: `Interactive text font-size: ${px}px — too small for mobile. Minimum 12px for labels, 14px for body.`,
              });
            }
          }
        }
      }
    }

    // ─── TSX/JSX checks ───
    const componentFiles = files.filter(
      f => f.path.endsWith('.tsx') || f.path.endsWith('.jsx'),
    );

    for (const file of componentFiles) {
      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];
        const lineNum = i + 1;

        // Check: inline style with small width/height on interactive elements
        // Pattern: width: N, height: N (in JSX style objects) where N < 32
        const inlineSize = line.match(/(?:width|height)\s*:\s*(\d+)/);
        if (inlineSize) {
          const px = parseInt(inlineSize[1], 10);
          if (px > 0 && px < 28) {
            // Check if this is inside a button, onClick handler, or similar
            const context = file.lines.slice(Math.max(0, i - 5), i + 3).join(' ');
            if (/onClick|onPress|<button|<a |role="button"|cursor.*pointer/i.test(context)) {
              issues.push({
                line: lineNum,
                file: file.path,
                detail: `Inline style: ${inlineSize[0]} on interactive element — below 44px minimum tap target.`,
              });
            }
          }
        }

        // Check: SVG icons with small explicit width/height
        const svgSize = line.match(/<svg[^>]*(?:width|height)="(\d+)"/);
        if (svgSize) {
          const px = parseInt(svgSize[1], 10);
          if (px > 0 && px < 16) {
            issues.push({
              line: lineNum,
              file: file.path,
              detail: `SVG icon size ${px}px — too small to see on mobile. Minimum 18-20px for icons.`,
            });
          }
        }
      }
    }

    if (issues.length > 0) {
      // Group by file
      const byFile = new Map<string, SizeIssue[]>();
      for (const issue of issues) {
        const arr = byFile.get(issue.file) || [];
        arr.push(issue);
        byFile.set(issue.file, arr);
      }

      for (const [file, fileIssues] of byFile) {
        const details = fileIssues
          .map(i => `  Line ${i.line}: ${i.detail}`)
          .join('\n');

        findings.push({
          ruleId: 'small-tap-targets',
          severity: 'medium',
          title: `Small tap targets/icons in ${file} (${fileIssues.length} issue${fileIssues.length > 1 ? 's' : ''})`,
          why:
            'AI-generated UIs consistently produce undersized interactive elements. ' +
            'On mobile, users will misclick, icons will be invisible, and the app feels broken.\n\n' + details,
          fix: [
            'All interactive elements (buttons, toggles, links): minimum 44×44px tap area (Apple HIG).',
            'Icons: minimum 18-20px visible size. Inline SVG width/height at least 18.',
            'Text on interactive elements: minimum 12px for labels, 14px for body text.',
            'If the visual element must be small, expand the tap area with padding (padding: 12px makes a 20px icon into a 44px tap target).',
          ],
          references: [
            'https://developer.apple.com/design/human-interface-guidelines/accessibility#Touch-targets',
            'https://web.dev/accessible-tap-targets/',
          ],
          file,
          line: fileIssues[0].line,
        });
      }
    }

    return findings;
  },
};
