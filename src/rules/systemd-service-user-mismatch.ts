import type { Rule, Finding, ScannedFile } from '../types.js';

// Rule: Systemd service missing User= directive or running as root with user home paths
// Detects TWO patterns:
// 1. .service file references /home/<user>/ in WorkingDirectory or ExecStart but has no User= line
// 2. .service file references /root/.nvm when NVM is likely installed under a non-root user

export const systemdServiceUserMismatch: Rule = {
  id: 'systemd-service-user-mismatch',
  severity: 'high',
  title: 'Systemd service missing User= directive or running as root with user home paths',
  description: `Systemd services that reference /home/<user>/ paths in WorkingDirectory or ExecStart but lack an explicit User= directive will run as root, creating permission issues and security risks.`,

  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];

    for (const file of files) {
      // Only check .service files
      if (!file.path.endsWith('.service')) continue;

      const c = file.content;
      const hasUserDirective = /^\s*User\s*=/m.test(c);

      // Pattern 1: References /home/<user>/ but no User= directive
      const homeDirInWorkDir = /^\s*WorkingDirectory\s*=\s*\/home\//m.test(c);
      const homeDirInExecStart = /^\s*ExecStart\s*=.*\/home\//m.test(c);
      const homeDirInEnv = /^\s*Environment\s*=.*\/home\//m.test(c);

      if ((homeDirInWorkDir || homeDirInExecStart || homeDirInEnv) && !hasUserDirective) {
        // Extract the username from the path for a helpful message
        const userMatch = c.match(/\/home\/([a-zA-Z0-9_-]+)/);
        const detectedUser = userMatch ? userMatch[1] : '<user>';

        findings.push({
          ruleId: 'systemd-service-user-mismatch',
          severity: 'high',
          title: `Systemd service references /home/${detectedUser}/ but has no User= directive`,
          why: `This service references paths under /home/${detectedUser}/ but will run as root (the default when User= is omitted).
Root cannot reliably access files owned by user "${detectedUser}" and may create root-owned files in their home directory, breaking permissions.
This pattern caused the openclaw-node service to crash-loop 151,000+ times in production.
See convention: linux-single-user-policy — on single-user Linux nodes, services accessing user home dirs must run as that user.`,
          fix: [
            `Add "User=${detectedUser}" to the [Service] section of the unit file.`,
            `Also add "Group=${detectedUser}" for completeness.`,
            `If the service needs root for binding to privileged ports, use capabilities (AmbientCapabilities=CAP_NET_BIND_SERVICE) instead of running the entire service as root.`,
          ],
          references: [
            'https://www.freedesktop.org/software/systemd/man/systemd.exec.html#User=',
            'convention: linux-single-user-policy',
          ],
          file: file.path,
        });
      }

      // Pattern 2: References /root/.nvm — NVM is almost never installed as root
      const rootNvmInExec = /^\s*ExecStart\s*=.*\/root\/\.nvm/m.test(c);
      const rootNvmInEnv = /^\s*Environment\s*=.*\/root\/\.nvm/m.test(c);

      if (rootNvmInExec || rootNvmInEnv) {
        findings.push({
          ruleId: 'systemd-service-user-mismatch',
          severity: 'high',
          title: 'Systemd service references /root/.nvm — likely wrong NVM path',
          why: `This service references /root/.nvm, but NVM is typically installed under a non-root user's home directory (e.g. /home/e/.nvm).
If the service runs as root and NVM was installed under a regular user, the node binary won't be found at /root/.nvm, causing ExecStart to fail.
If NVM WAS installed as root, the service is still running node as root unnecessarily — a security risk.
See convention: linux-single-user-policy.`,
          fix: [
            'Set User= to the actual user who installed NVM (e.g. User=e).',
            'Update the path to use that user\'s NVM install (e.g. /home/e/.nvm/versions/node/...).',
            'Alternatively, use the system-wide node install path instead of a user-specific NVM path.',
          ],
          references: [
            'https://github.com/nvm-sh/nvm#important-notes',
            'convention: linux-single-user-policy',
          ],
          file: file.path,
        });
      }
    }

    return findings;
  },
};
