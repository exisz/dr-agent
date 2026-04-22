// Rule: Vercel monorepo project missing ignoreBuildStep / "Skip unaffected projects" trap
// Detects monorepos with multiple Vercel projects that share a single Git repo
// and warns when there is no ignoreBuildStep configured (or when it's the
// crude "always build on main" pattern).
//
// Why: Vercel auto-cancels builds with readyStateReason
// "The Deployment has been canceled because this project was not affected"
// when no files in the project's rootDirectory changed. New monorepo projects
// that have never had a successful deploy (catch-22) get stuck in CANCELED
// loops. Even after seeding, without a path-based ignoreBuildStep, every push
// triggers builds on EVERY linked project — wasting build minutes.

import type { Rule, Finding, ScannedFile } from '../types.js';

interface VercelProjectHints {
  hasMonorepoLayout: boolean;     // apps/ or packages/ subdirs
  vercelJsonFiles: ScannedFile[]; // any vercel.json found
  rootHasVercelJson: boolean;
  appLikeDirs: string[];          // apps/admin, apps/landing, etc
  hasPnpmWorkspace: boolean;
  hasTurboJson: boolean;
}

function gatherHints(files: ScannedFile[]): VercelProjectHints {
  const h: VercelProjectHints = {
    hasMonorepoLayout: false,
    vercelJsonFiles: [],
    rootHasVercelJson: false,
    appLikeDirs: [],
    hasPnpmWorkspace: false,
    hasTurboJson: false,
  };
  const appDirs = new Set<string>();
  for (const f of files) {
    if (f.path.endsWith('vercel.json')) {
      h.vercelJsonFiles.push(f);
      if (f.path === 'vercel.json' || f.path.endsWith('/vercel.json') === false) {
        h.rootHasVercelJson = h.rootHasVercelJson || !f.path.includes('/');
      }
    }
    const m = f.path.match(/^(apps|packages)\/([^/]+)\//);
    if (m) {
      h.hasMonorepoLayout = true;
      if (m[1] === 'apps') appDirs.add(`apps/${m[2]}`);
    }
    if (f.path === 'pnpm-workspace.yaml') h.hasPnpmWorkspace = true;
    if (f.path === 'turbo.json') h.hasTurboJson = true;
  }
  h.appLikeDirs = [...appDirs];
  return h;
}

function looksLikeDeployableApp(files: ScannedFile[], dir: string): boolean {
  // Has its own package.json with a "build" script
  const pkg = files.find(f => f.path === `${dir}/package.json`);
  if (!pkg) return false;
  try {
    const j = JSON.parse(pkg.content);
    return Boolean(j.scripts && (j.scripts.build || j.scripts['vercel-build']));
  } catch {
    return false;
  }
}

function vercelJsonHasIgnore(file: ScannedFile): { has: boolean; crude: boolean } {
  try {
    const j = JSON.parse(file.content);
    const cmd = j.ignoreCommand || j.git?.deploymentEnabled?.ignoreCommand;
    if (typeof cmd !== 'string' || cmd.trim() === '') return { has: false, crude: false };
    // Crude pattern: "if main then exit 1" — always builds on main, defeats the purpose
    const crude = /VERCEL_GIT_COMMIT_REF.*main.*exit\s+1/s.test(cmd) ||
                  /\bexit\s+1\b/.test(cmd) && !/git\s+diff/.test(cmd);
    return { has: true, crude };
  } catch {
    return { has: false, crude: false };
  }
}

export const vercelMonorepoIgnoreBuild: Rule = {
  id: 'vercel-monorepo-ignore-build-step',
  severity: 'medium',
  title: 'Vercel monorepo project missing path-based ignoreBuildStep (Skip unaffected trap)',
  description: `Vercel auto-cancels Git deploys with readyStateReason "The Deployment has been canceled because this project was not affected" when no files in the project's rootDirectory changed since the previous deploy.

Two failure modes:

1. **Catch-22 on first deploy.** A newly created monorepo project that has never had a successful deploy will sit at CANCELED forever — every push triggers a CANCELED because Vercel can't compare against any previous successful build for "this rootDirectory". Common symptom: every deployment shows state=CANCELED, build duration 0ms, no errorMessage. You must seed the first deploy manually (Vercel CLI \`vercel --prod\` from the rootDir, or POST /v13/deployments with forceNew=1).

2. **Wasteful default after seeding.** Once seeded, by default EVERY push to main triggers builds on EVERY Vercel project linked to the repo — even projects whose files didn't change. Fix this with a path-based ignoreBuildStep, e.g. \`git diff HEAD^ HEAD --quiet -- . ../../pnpm-lock.yaml || exit 1\` (run from project rootDir).

Anti-pattern to avoid: \`if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi\` — this is "always build on main", which defeats the purpose and burns build minutes.`,
  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];
    const h = gatherHints(files);

    if (!h.hasMonorepoLayout) return findings;

    // Identify deployable apps (apps/* with package.json + build script)
    const deployableApps = h.appLikeDirs.filter(d => looksLikeDeployableApp(files, d));
    if (deployableApps.length < 2) return findings; // need ≥2 projects to be a multi-deploy monorepo

    // Check each app for its own vercel.json with ignoreCommand
    const offenders: string[] = [];
    const crudeOffenders: { dir: string; crude: string }[] = [];
    for (const dir of deployableApps) {
      const vj = files.find(f => f.path === `${dir}/vercel.json`);
      if (!vj) {
        offenders.push(dir);
        continue;
      }
      const { has, crude } = vercelJsonHasIgnore(vj);
      if (!has) {
        offenders.push(dir);
      } else if (crude) {
        try {
          const j = JSON.parse(vj.content);
          const cmd = j.ignoreCommand || j.git?.deploymentEnabled?.ignoreCommand || '';
          crudeOffenders.push({ dir, crude: cmd });
        } catch { /* ignore */ }
      }
    }

    if (offenders.length > 0) {
      findings.push({
        ruleId: 'vercel-monorepo-ignore-build-step',
        severity: 'medium',
        title: 'Vercel monorepo apps missing path-based ignoreBuildStep',
        why: `Found ${deployableApps.length} deployable apps in this monorepo (${deployableApps.join(', ')}). ${offenders.length} of them (${offenders.join(', ')}) have no vercel.json with an ignoreCommand.

Without a path-based ignoreBuildStep, Vercel will either (a) cancel ALL builds with "project was not affected" if the project has never had a successful deploy (catch-22), or (b) once seeded, build EVERY project on EVERY push regardless of which app actually changed — wasting build minutes and triggering unnecessary deploys.`,
        fix: [
          'For each deployable app, add a vercel.json in its rootDirectory with: {"ignoreCommand": "git diff HEAD^ HEAD --quiet -- . ../../pnpm-lock.yaml || exit 1"} (adjust lockfile path to match your package manager).',
          'Alternatively configure the same command via Vercel project settings UI (Settings → Git → Ignored Build Step) or via API: PATCH /v9/projects/{name} with body {"commandForIgnoringBuildStep": "<cmd>"}.',
          'For a brand-new project stuck in CANCELED loop (catch-22): seed the first successful deploy manually with `vercel --prod` from inside the rootDir, OR use Vercel REST API POST /v13/deployments?forceNew=1 with the latest gitSource SHA. After one successful deploy, the path-based ignore will work normally.',
          'If shared packages (e.g. packages/* in monorepo) affect the app, include their paths in the diff: `git diff HEAD^ HEAD --quiet -- . ../../packages/shared ../../pnpm-lock.yaml || exit 1`.',
        ],
        references: [
          'https://vercel.com/docs/monorepos#skipping-unaffected-projects',
          'https://vercel.com/docs/deployments/configure-a-build#ignored-build-step',
          'https://github.com/exisz/dr-agent (rule: vercel-monorepo-ignore-build-step)',
        ],
      });
    }

    for (const off of crudeOffenders) {
      findings.push({
        ruleId: 'vercel-monorepo-ignore-build-step',
        severity: 'low',
        title: `Vercel ignoreBuildStep is "always build on main" (defeats path-based skipping) at ${off.dir}/vercel.json`,
        why: `The ignoreCommand at ${off.dir}/vercel.json is the crude "if branch == main then build, else skip" pattern (\`${off.crude.slice(0, 120)}\`).

This unconditionally builds on every push to main regardless of which files changed — wasting build minutes and defeating Vercel's path-based skip mechanism. It also gives no protection on preview branches.`,
        fix: [
          `Replace the ignoreCommand with a path-based diff, e.g. \`git diff HEAD^ HEAD --quiet -- . ../../pnpm-lock.yaml || exit 1\` (from rootDir; "." == rootDir).`,
          'For shared monorepo packages, add their paths to the diff so changes there also trigger a rebuild.',
          'Test by pushing a commit that touches only an unrelated app — the build for this project should be skipped (not CANCELED with reason "project was not affected", but properly Skipped with exit 0).',
        ],
        references: [
          'https://vercel.com/docs/monorepos#skipping-unaffected-projects',
          'https://github.com/exisz/dr-agent (rule: vercel-monorepo-ignore-build-step)',
        ],
        file: `${off.dir}/vercel.json`,
      });
    }

    return findings;
  },
};
