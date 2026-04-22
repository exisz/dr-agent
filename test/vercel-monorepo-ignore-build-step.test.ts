import { describe, it, expect } from 'vitest';
import { vercelMonorepoIgnoreBuild } from '../src/rules/vercel-monorepo-ignore-build-step.js';
import type { ScannedFile } from '../src/types.js';

function f(path: string, content: string): ScannedFile {
  return { path, content, lines: content.split('\n') };
}

describe('vercel-monorepo-ignore-build-step rule', () => {
  it('does not flag a single-app non-monorepo project', () => {
    const files: ScannedFile[] = [
      f('package.json', '{"name":"app","scripts":{"build":"next build"}}'),
      f('next.config.js', 'module.exports = {}'),
    ];
    const findings = vercelMonorepoIgnoreBuild.check(files);
    expect(findings).toEqual([]);
  });

  it('does not flag a single-app monorepo (only one deployable app)', () => {
    const files: ScannedFile[] = [
      f('pnpm-workspace.yaml', "packages:\n  - 'apps/*'"),
      f('apps/web/package.json', '{"name":"web","scripts":{"build":"next build"}}'),
      f('apps/web/next.config.js', 'module.exports = {}'),
    ];
    const findings = vercelMonorepoIgnoreBuild.check(files);
    expect(findings).toEqual([]);
  });

  it('flags a multi-app monorepo with no vercel.json files', () => {
    const files: ScannedFile[] = [
      f('pnpm-workspace.yaml', "packages:\n  - 'apps/*'"),
      f('apps/admin/package.json', '{"name":"admin","scripts":{"build":"vite build"}}'),
      f('apps/admin/index.html', '<html></html>'),
      f('apps/landing/package.json', '{"name":"landing","scripts":{"build":"astro build"}}'),
      f('apps/landing/astro.config.mjs', 'export default {}'),
    ];
    const findings = vercelMonorepoIgnoreBuild.check(files);
    expect(findings.length).toBeGreaterThan(0);
    const main = findings.find(x => x.severity === 'medium');
    expect(main).toBeDefined();
    expect(main!.title).toContain('missing path-based ignoreBuildStep');
    expect(main!.why).toContain('apps/admin');
    expect(main!.why).toContain('apps/landing');
  });

  it('flags the crude "always build on main" anti-pattern', () => {
    const files: ScannedFile[] = [
      f('pnpm-workspace.yaml', "packages:\n  - 'apps/*'"),
      f('apps/admin/package.json', '{"name":"admin","scripts":{"build":"vite build"}}'),
      f('apps/admin/vercel.json', JSON.stringify({
        ignoreCommand: 'bash -c "if [ \\"$VERCEL_GIT_COMMIT_REF\\" = \\"main\\" ]; then exit 1; else exit 0; fi"',
      })),
      f('apps/landing/package.json', '{"name":"landing","scripts":{"build":"astro build"}}'),
      f('apps/landing/vercel.json', JSON.stringify({
        ignoreCommand: 'git diff HEAD^ HEAD --quiet -- . ../../pnpm-lock.yaml || exit 1',
      })),
    ];
    const findings = vercelMonorepoIgnoreBuild.check(files);
    const lowFinding = findings.find(x => x.severity === 'low' && x.file === 'apps/admin/vercel.json');
    expect(lowFinding).toBeDefined();
    expect(lowFinding!.title).toContain('always build on main');
    // landing's good config should not be flagged
    expect(findings.find(x => x.file === 'apps/landing/vercel.json')).toBeUndefined();
  });

  it('does NOT flag a properly configured monorepo with path-based ignoreCommand on every app', () => {
    const goodCmd = 'git diff HEAD^ HEAD --quiet -- . ../../pnpm-lock.yaml || exit 1';
    const files: ScannedFile[] = [
      f('pnpm-workspace.yaml', "packages:\n  - 'apps/*'"),
      f('apps/admin/package.json', '{"name":"admin","scripts":{"build":"vite build"}}'),
      f('apps/admin/vercel.json', JSON.stringify({ ignoreCommand: goodCmd })),
      f('apps/landing/package.json', '{"name":"landing","scripts":{"build":"astro build"}}'),
      f('apps/landing/vercel.json', JSON.stringify({ ignoreCommand: goodCmd })),
    ];
    const findings = vercelMonorepoIgnoreBuild.check(files);
    expect(findings).toEqual([]);
  });

  it('rule has correct metadata', () => {
    expect(vercelMonorepoIgnoreBuild.id).toBe('vercel-monorepo-ignore-build-step');
    expect(vercelMonorepoIgnoreBuild.severity).toBe('medium');
    expect(vercelMonorepoIgnoreBuild.title).toBeTruthy();
    expect(vercelMonorepoIgnoreBuild.description).toBeTruthy();
  });
});
