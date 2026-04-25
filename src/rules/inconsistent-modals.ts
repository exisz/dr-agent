// Rule: Inconsistent modal/overlay implementations
//
// AI agents frequently create multiple parallel modal/drawer/overlay systems
// in the same project — some files use a shared Modal component, others
// hand-roll createPortal + their own backdrop CSS. This leads to:
//   - Different visual styles (one has solid bg, another is transparent)
//   - Different keyboard/scroll handling
//   - Different z-index layers conflicting
//   - Maintenance hell when fixing a bug in one system but not the other
//
// Detection: count files using a shared Modal/Dialog component vs files
// that hand-roll createPortal with overlay/backdrop CSS. If both > 0, report.

import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

interface ModalUsage {
  file: string;
  line: number;
  pattern: 'shared-component' | 'hand-rolled';
  detail: string;
}

export const inconsistentModals: Rule = {
  id: 'inconsistent-modals',
  severity: 'medium',
  title: 'Inconsistent modal/overlay implementations (multiple systems in one project)',
  description:
    'AI agents frequently create parallel modal/drawer/overlay systems in the same project. ' +
    'Some files import a shared Modal component; others hand-roll createPortal with custom backdrop CSS. ' +
    'This causes visual inconsistency, different keyboard handling, and z-index conflicts.',

  check(files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const usages: ModalUsage[] = [];

    const componentFiles = files.filter(
      f => f.path.endsWith('.tsx') || f.path.endsWith('.jsx'),
    );

    if (componentFiles.length === 0) return findings;

    // Identify the "shared component" pattern: importing a Modal/Dialog component
    // Ignore the Modal component definition file itself
    const modalComponentFiles = new Set<string>();

    for (const file of componentFiles) {
      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];

        // Detect: exports a Modal/Dialog component (this IS the shared component)
        if (/export\s+(?:default\s+)?function\s+(?:Modal|Dialog|Sheet|BottomSheet)\s*\(/.test(line)) {
          modalComponentFiles.add(file.path);
        }
      }
    }

    for (const file of componentFiles) {
      // Skip the shared modal component definition itself
      if (modalComponentFiles.has(file.path)) continue;

      let usesSharedModal = false;
      let sharedModalLine = 0;
      let usesHandRolled = false;
      let handRolledLine = 0;
      let handRolledDetail = '';

      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];
        const lineNum = i + 1;

        // Pattern A: importing a shared Modal/Dialog component
        if (/import\s+.*(?:Modal|Dialog|Sheet|BottomSheet)\s+from/.test(line) ||
            /import\s*\{[^}]*(?:Modal|Dialog|Sheet|BottomSheet)[^}]*\}\s*from/.test(line)) {
          usesSharedModal = true;
          sharedModalLine = lineNum;
        }

        // Pattern B: hand-rolling a modal with createPortal + overlay backdrop
        if (/createPortal\s*\(/.test(line)) {
          // Check surrounding lines for overlay/backdrop indicators
          const window = file.lines.slice(Math.max(0, i - 3), Math.min(file.lines.length, i + 15)).join(' ');
          if (/fixed\s+inset|position:\s*fixed|lf-scrim|lf-sheet|bg-black\/|backdrop|overlay|z-\[?\d+\]?/i.test(window)) {
            usesHandRolled = true;
            handRolledLine = lineNum;
            // Try to identify which CSS system
            if (/lf-scrim|lf-sheet/.test(window)) {
              handRolledDetail = 'uses lf-scrim/lf-sheet CSS classes';
            } else if (/bg-black|backdrop/.test(window)) {
              handRolledDetail = 'uses custom Tailwind backdrop';
            } else {
              handRolledDetail = 'uses custom fixed overlay';
            }
          }
        }
      }

      if (usesSharedModal) {
        usages.push({
          file: file.path,
          line: sharedModalLine,
          pattern: 'shared-component',
          detail: 'imports shared Modal/Dialog component',
        });
      }
      if (usesHandRolled) {
        usages.push({
          file: file.path,
          line: handRolledLine,
          pattern: 'hand-rolled',
          detail: handRolledDetail,
        });
      }
    }

    // Only report if BOTH patterns exist (inconsistency)
    const shared = usages.filter(u => u.pattern === 'shared-component');
    const handRolled = usages.filter(u => u.pattern === 'hand-rolled');

    if (shared.length > 0 && handRolled.length > 0) {
      const sharedList = shared.map(u => `  ✓ ${u.file}:${u.line} — ${u.detail}`).join('\n');
      const handRolledList = handRolled.map(u => `  ✗ ${u.file}:${u.line} — ${u.detail}`).join('\n');

      findings.push({
        ruleId: 'inconsistent-modals',
        severity: 'medium',
        title: `Inconsistent modals: ${shared.length} file(s) use shared component, ${handRolled.length} file(s) hand-roll their own`,
        why:
          'This project has a shared Modal/Dialog component, but some files bypass it and ' +
          'hand-roll their own overlay with createPortal. This causes visual inconsistency ' +
          '(different backgrounds, borders, animations), different keyboard/scroll handling, ' +
          'and z-index conflicts.\n\n' +
          'Using shared Modal component:\n' + sharedList + '\n\n' +
          'Hand-rolling their own overlay:\n' + handRolledList,
        fix: [
          'Migrate all hand-rolled overlays to use the shared Modal/Dialog component.',
          'If the shared component lacks features (e.g. drawer mode, custom sizing), extend it rather than creating a parallel system.',
          'Delete unused overlay CSS classes (e.g. lf-scrim, lf-sheet) after migration to prevent future agents from reusing them.',
        ],
        references: [],
        file: handRolled[0].file,
        line: handRolled[0].line,
      });
    }

    return findings;
  },
};
