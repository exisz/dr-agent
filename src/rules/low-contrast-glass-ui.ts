// Rule: Low-contrast glass/frosted UI patterns
//
// AI-generated CSS consistently produces low-contrast glass UIs:
//   - Card backgrounds nearly invisible against page backgrounds
//   - Text colors too close to card background
//   - Hairline borders with alpha < 0.10 (invisible)
//   - Glass/frosted overlays with very low opacity (< 0.5)
//
// This rule scans CSS files for common contrast-killing patterns and flags
// them with concrete remediation advice.

import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

/** Parse rgba(r, g, b, a) → alpha value, or null if not rgba. */
function parseRgbaAlpha(value: string): number | null {
  const m = value.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
  return m ? parseFloat(m[1]) : null;
}

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
  type: 'glass-opacity' | 'hairline-alpha' | 'text-bg-contrast' | 'glass-hi-alpha';
  line: number;
  file: string;
  detail: string;
}

export const lowContrastGlassUi: Rule = {
  id: 'low-contrast-glass-ui',
  severity: 'medium',
  title: 'Low-contrast glass/frosted UI (AI-generated CSS pitfall)',
  description:
    'AI-generated CSS consistently produces glass/frosted UIs with near-zero contrast: ' +
    'card backgrounds blend into the page, text is barely readable, and hairline borders are invisible. ' +
    'This rule checks for common contrast-killing CSS patterns in custom properties and rgba values.',

  check(files: ScannedFile[], ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const issues: ContrastIssue[] = [];

    // Collect CSS custom property values across all CSS files
    const cssFiles = files.filter(
      f => f.path.endsWith('.css') || f.path.endsWith('.scss') || f.path.endsWith('.less'),
    );

    if (cssFiles.length === 0) return findings;

    // Known variable patterns to check
    const glassVarPattern = /--(?:glass|overlay|frosted|backdrop|card-bg)\s*:\s*rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/g;
    const hairlineVarPattern = /--(?:hairline|border|divider|separator|outline)\s*:\s*rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/g;
    const glassHiVarPattern = /--(?:glass-hi|highlight|card-highlight|hover)\s*:\s*rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/g;

    // Check text/bg contrast between custom properties in the same scope
    const textVarPattern = /--(?:text-0|text-primary|fg|foreground|text-main|color-text)\s*:\s*(#[0-9a-fA-F]{6})/g;
    const bgVarPattern = /--(?:bg-0|bg-primary|background|bg-main|bg-base|bg-1|bg-2)\s*:\s*(#[0-9a-fA-F]{6})/g;

    for (const file of cssFiles) {
      const lines = file.lines;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check glass/overlay opacity
        let m;
        const glassRe = /--(?:glass|overlay|frosted|backdrop|card-bg)\s*:\s*rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/g;
        while ((m = glassRe.exec(line)) !== null) {
          const alpha = parseFloat(m[1]);
          if (alpha < 0.55) {
            issues.push({
              type: 'glass-opacity',
              line: lineNum,
              file: file.path,
              detail: `Glass/card background alpha=${alpha} (< 0.55) — card will blend into page background. Raise to 0.65-0.80.`,
            });
          }
        }

        // Check hairline/border alpha
        const hairlineRe = /--(?:hairline|border-color|divider|separator)\s*:\s*rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/g;
        while ((m = hairlineRe.exec(line)) !== null) {
          const alpha = parseFloat(m[1]);
          if (alpha < 0.12) {
            issues.push({
              type: 'hairline-alpha',
              line: lineNum,
              file: file.path,
              detail: `Hairline/border alpha=${alpha} (< 0.12) — border will be invisible. Raise to 0.14-0.20.`,
            });
          }
        }

        // Check glass-hi/highlight alpha
        const hiRe = /--(?:glass-hi|highlight|card-highlight)\s*:\s*rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/g;
        while ((m = hiRe.exec(line)) !== null) {
          const alpha = parseFloat(m[1]);
          if (alpha < 0.08) {
            issues.push({
              type: 'glass-hi-alpha',
              line: lineNum,
              file: file.path,
              detail: `Highlight/interactive-bg alpha=${alpha} (< 0.08) — hover/active state invisible. Raise to 0.10-0.16.`,
            });
          }
        }

        // Inline backdrop-filter without sufficient contrast check
        // (advisory: if you use backdrop-filter blur, ensure container has enough bg opacity)
      }

      // Cross-property text vs background contrast check
      const textColors: Array<{ hex: string; line: number }> = [];
      const bgColors: Array<{ hex: string; line: number }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let tm;
        const textRe = /--(?:text-0|text-primary|fg|foreground|text-main|color-text)\s*:\s*(#[0-9a-fA-F]{6})/g;
        while ((tm = textRe.exec(line)) !== null) {
          textColors.push({ hex: tm[1], line: i + 1 });
        }
        const bgRe = /--(?:bg-0|bg-primary|background|bg-main|bg-base)\s*:\s*(#[0-9a-fA-F]{6})/g;
        while ((tm = bgRe.exec(line)) !== null) {
          bgColors.push({ hex: tm[1], line: i + 1 });
        }
      }

      // Check all text-bg pairs within the same file
      for (const tc of textColors) {
        const tLum = hexToLuminance(tc.hex);
        if (tLum === null) continue;
        for (const bg of bgColors) {
          const bLum = hexToLuminance(bg.hex);
          if (bLum === null) continue;
          const ratio = contrastRatio(tLum, bLum);
          // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
          if (ratio < 3.0) {
            issues.push({
              type: 'text-bg-contrast',
              line: tc.line,
              file: file.path,
              detail: `Text ${tc.hex} (line ${tc.line}) vs background ${bg.hex} (line ${bg.line}): contrast ratio ${ratio.toFixed(1)}:1 — below WCAG 3:1 minimum. Darken the background or lighten the text.`,
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
          ruleId: 'low-contrast-glass-ui',
          severity: 'medium',
          title: `Low-contrast glass UI detected in ${file} (${fileIssues.length} issue${fileIssues.length > 1 ? 's' : ''})`,
          why:
            'AI-generated glass/frosted UIs consistently produce near-zero visual contrast. ' +
            'Cards blend into the page, borders are invisible, and text is unreadable. ' +
            'This is one of the most common AI CSS pitfalls.\n\n' + details,
          fix: [
            'Glass/card backgrounds: use rgba alpha >= 0.65 (not 0.4-0.55). Cards must be visually distinct from the page.',
            'Hairline borders: use rgba alpha >= 0.14 (not 0.06-0.10). Borders must be visible.',
            'Interactive highlights (hover/active): use rgba alpha >= 0.10 (not 0.04-0.06).',
            'Text vs background: ensure WCAG AA contrast ratio >= 4.5:1 for body text, >= 3:1 for large text.',
            'Secondary text (--text-2, --text-muted): keep luminance difference >= 30% from card background, not just 10%.',
            'Test with a screenshot tool — if you squint and elements disappear, contrast is too low.',
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
