import { logtoResourceTokenUserinfo } from './logto-resource-token-userinfo.js';
import { vercelMonorepoIgnoreBuild } from './vercel-monorepo-ignore-build-step.js';
import { tmpCloneLocation } from './tmp-clone-location.js';
import { lowContrastCss } from './low-contrast-css.js';
import { uiLeaksInternalTechNames } from './ui-leaks-internal-tech-names.js';
import type { Rule } from '../types.js';

export const rules: Rule[] = [
  logtoResourceTokenUserinfo,
  vercelMonorepoIgnoreBuild,
  tmpCloneLocation,
  lowContrastCss,
  uiLeaksInternalTechNames,
];

export function getRuleById(id: string): Rule | undefined {
  return rules.find(r => r.id === id);
}
