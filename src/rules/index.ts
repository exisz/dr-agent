import { logtoResourceTokenUserinfo } from './logto-resource-token-userinfo.js';
import { vercelMonorepoIgnoreBuild } from './vercel-monorepo-ignore-build-step.js';
import { tmpCloneLocation } from './tmp-clone-location.js';
import { lowContrastCss } from './low-contrast-css.js';
import { uiLeaksInternalTechNames } from './ui-leaks-internal-tech-names.js';
import { smallTapTargets } from './small-tap-targets.js';
import { logtoPostLogoutUri } from './logto-post-logout-uri.js';
import { inconsistentModals } from './inconsistent-modals.js';
import { systemdServiceUserMismatch } from './systemd-service-user-mismatch.js';
import { localDevDrift } from './local-dev-drift.js';
import { gogGmailWrongSyntax } from './gog-gmail-wrong-syntax.js';
import { jiraPhantomProject } from './jira-phantom-project.js';
import { cronLiveInfraChecks } from './cron-live-infra-checks.js';
import { ghProjectv2OptionsOverwrite } from './gh-projectv2-options-overwrite.js';
import type { Rule } from '../types.js';

export const rules: Rule[] = [
  logtoResourceTokenUserinfo,
  vercelMonorepoIgnoreBuild,
  tmpCloneLocation,
  lowContrastCss,
  uiLeaksInternalTechNames,
  smallTapTargets,
  logtoPostLogoutUri,
  inconsistentModals,
  systemdServiceUserMismatch,
  localDevDrift,
  gogGmailWrongSyntax,
  jiraPhantomProject,
  cronLiveInfraChecks,
  ghProjectv2OptionsOverwrite,
];

export function getRuleById(id: string): Rule | undefined {
  return rules.find(r => r.id === id);
}
