// Rule: Low CSS contrast (AI-generated CSS pitfall)
//
// AI-generated CSS consistently produces low-contrast UIs regardless of style:
//   - Card/container backgrounds too close to page backgrounds
//   - Text colors too close to their container backgrounds
//   - Borders with very low alpha (invisible)
//   - Interactive state backgrounds barely distinguishable
//
// This rule scans ALL CSS custom properties for contrast issues,
// not just glass/frosted patterns.

import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

/** Check if two hex colors have low relative luminance contrast. */
function hexToLuminance(hex: string): number | null {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

interface ContrastIssue {
  type: 'container-opacity' | 'border-alpha' | 'text-bg-contrast' | 'interactive-alpha';
  line: number;
  file: string;
  detail: string;
}

// CSS custom property names that typically represent container/card backgrounds
const CONTAINER_BG_NAMES = [
  'glass', 'overlay', 'frosted', 'backdrop', 'card-bg', 'card-background',
  'surface', 'panel', 'container-bg', 'modal-bg', 'popover-bg', 'dropdown-bg',
  'sidebar-bg', 'nav-bg', 'menu-bg', 'tooltip-bg',
];

// CSS custom property names for borders/dividers
const BORDER_NAMES = [
  'hairline', 'border', 'divider', 'separator', 'outline', 'border-color',
  'border-subtle', 'ring', 'stroke',
];

// CSS custom property names for interactive/highlight states
const INTERACTIVE_NAMES = [
  'glass-hi', 'highlight', 'card-highlight', 'hover', 'hover-bg',
  'active-bg', 'focus-bg', 'selected-bg', 'pressed',
];

// CSS custom property names for text colors
const TEXT_NAMES = [
  'text-0', 'text-1', 'text-primary', 'fg', 'foreground', 'text-main',
  'color-text', 'text-default', 'heading', 'body-text',
];

// CSS custom property names for page/root backgrounds
const PAGE_BG_NAMES = [
  'bg-0', 'bg-1', 'bg-2', 'bg-primary', 'background', 'bg-main', 'bg-base',
  'bg-page', 'bg-root', 'bg-body', 'page-bg', 'root-bg',
];

function buildVarPattern(names: string[]): RegExp {
  // Match: --<any-of-names>: rgba(r, g, b, alpha)
  // Also match with prefix, e.g. --lf-glass, --app-border
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const nameGroup = escaped.join('|');
  return new RegExp(
    `--(?:[a-z0-9]+-)?(?:${nameGroup})\\s*:\\s*rgba\\(\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*([\\d.]+)\\s*\\)`,
    'g',
  );
}

function buildHexVarPattern(names: string[]): RegExp {
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const nameGroup = escaped.join('|');
  return new RegExp(
    `--(?:[a-z0-9]+-)?(?:${nameGroup})\\s*:\\s*(#[0-9a-fA-F]{6})`,
    'g',
  );
}

export const lowContrastCss: Rule = {
  id: 'low-contrast-css',
  severity: 'medium',
  title: 'Low CSS contrast (AI-generated CSS pitfall)',
  description:
    'AI-generated CSS consistently produces low-contrast UIs: ' +
    'container backgrounds blend into pages, text is barely readable, borders are invisible, ' +
    'and interactive states have no visual feedback. ' +
    'This rule checks CSS custom properties for contrast issues regardless of design style.',

  check(files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const issues: ContrastIssue[] = [];

    const cssFiles = files.filter(
      f => f.path.endsWith('.css') || f.path.endsWith('.scss') || f.path.endsWith('.less'),
    );

    if (cssFiles.length === 0) return findings;

    const containerBgRe = buildVarPattern(CONTAINER_BG_NAMES);
    const borderRe = buildVarPattern(BORDER_NAMES);
    const interactiveRe = buildVarPattern(INTERACTIVE_NAMES);

    for (const file of cssFiles) {
      const lines = file.lines;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check container/card background opacity
        let m;
        containerBgRe.lastIndex = 0;
        while ((m = containerBgRe.exec(line)) !== null) {
          const alpha = parseFloat(m[1]);
          if (alpha < 0.55) {
            issues.push({
              type: 'container-opacity',
              line: lineNum,
              file: file.path,
              detail: `Container/card background alpha=${alpha} (< 0.55) — will blend into page background. Raise to 0.65-0.80.`,
            });
          }
        }

        // Check border/divider alpha
        borderRe.lastIndex = 0;
        while ((m = borderRe.exec(line)) !== null) {
          const alpha = parseFloat(m[1]);
          if (alpha < 0.12) {
            issues.push({
              type: 'border-alpha',
              line: lineNum,
              file: file.path,
              detail: `Border/divider alpha=${alpha} (< 0.12) — will be invisible. Raise to 0.14-0.20.`,
            });
          }
        }

        // Check interactive state alpha
        interactiveRe.lastIndex = 0;
        while ((m = interactiveRe.exec(line)) !== null) {
          const alpha = parseFloat(m[1]);
          if (alpha < 0.08) {
            issues.push({
              type: 'interactive-alpha',
              line: lineNum,
              file: file.path,
              detail: `Interactive/hover background alpha=${alpha} (< 0.08) — state change invisible. Raise to 0.10-0.16.`,
            });
          }
        }
      }

      // Cross-property text vs background contrast check
      const textColors: Array<{ hex: string; line: number }> = [];
      const bgColors: Array<{ hex: string; line: number }> = [];

      const textRe = buildHexVarPattern(TEXT_NAMES);
      const bgRe = buildHexVarPattern(PAGE_BG_NAMES);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let tm;

        textRe.lastIndex = 0;
        while ((tm = textRe.exec(line)) !== null) {
          textColors.push({ hex: tm[1], line: i + 1 });
        }

        bgRe.lastIndex = 0;
        while ((tm = bgRe.exec(line)) !== null) {
          bgColors.push({ hex: tm[1], line: i + 1 });
        }
      }

      // Check all text-bg pairs within the same file
      // Note: cross-theme false positives (dark text vs dark bg from different theme blocks)
      // are expected — the fix suggestion makes it clear these are per-theme checks
      for (const tc of textColors) {
        const tLum = hexToLuminance(tc.hex);
        if (tLum === null) continue;
        for (const bg of bgColors) {
          const bLum = hexToLuminance(bg.hex);
          if (bLum === null) continue;
          const ratio = contrastRatio(tLum, bLum);
          // WCAG AA: 4.5:1 for normal text, 3:1 for large text. We use 3:1 as floor.
          if (ratio < 3.0) {
            issues.push({
              type: 'text-bg-contrast',
              line: tc.line,
              file: file.path,
              detail: `Text ${tc.hex} (line ${tc.line}) vs background ${bg.hex} (line ${bg.line}): contrast ratio ${ratio.toFixed(1)}:1 — below WCAG 3:1 minimum.`,
            });
          }
        }
      }
    }

    if (issues.length > 0) {
      // Group by file
      const byFile = new Map<string, ContrastIssue[]>();
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
          ruleId: 'low-contrast-css',
          severity: 'medium',
          title: `Low CSS contrast in ${file} (${fileIssues.length} issue${fileIssues.length > 1 ? 's' : ''})`,
          why:
            'AI-generated CSS consistently produces near-zero contrast between layers: ' +
            'containers vs page, text vs container, borders vs background, hover vs resting state. ' +
            'This is one of the most common AI CSS pitfalls — happens with any design style, not just glass/frosted.\n\n' + details,
          fix: [
            'Container backgrounds: ensure they are visually distinct from the page (rgba alpha >= 0.65, or use solid colors with sufficient contrast).',
            'Borders/dividers: rgba alpha >= 0.14 (not 0.06-0.10) — must be visible without squinting.',
            'Interactive states (hover/active/focus): rgba alpha >= 0.10 — users must see state changes.',
            'Text vs background: WCAG AA requires 4.5:1 for body text, 3:1 for large text (18px+ bold or 24px+).',
            'Secondary/muted text: still needs >= 3:1 against its container. "Muted" ≠ invisible.',
            'Quick test: take a screenshot, desaturate to grayscale — if elements disappear, contrast is too low.',
          ],
          references: [
            'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html',
            'https://webaim.org/resources/contrastchecker/',
          ],
          file,
          line: fileIssues[0].line,
        });
      }
    }

    return findings;
  },
};
