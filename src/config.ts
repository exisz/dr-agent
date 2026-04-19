import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { DrAgentConfig } from './types.js';

const CONFIG_FILENAMES = [
  'dr-agent.config.json',
  '.dr-agent.json',
];

export function loadConfig(dir: string): DrAgentConfig {
  for (const filename of CONFIG_FILENAMES) {
    const fp = path.resolve(dir, filename);
    if (existsSync(fp)) {
      try {
        const raw = readFileSync(fp, 'utf-8');
        return JSON.parse(raw) as DrAgentConfig;
      } catch {
        // ignore malformed config
      }
    }
  }

  // dr-agent.config.js (ESM/CJS) — skip dynamic require for now (v0.3 problem)
  return {};
}

export const DEFAULT_CONFIG_CONTENT = JSON.stringify(
  {
    rules: {
      'logto-resource-token-userinfo': 'high',
      'jwks-not-cached': 'medium',
      'cors-missing-custom-auth-header': 'high',
      'stripe-webhook-after-json-body-parser': 'high',
      'oidc-resource-token-to-userinfo': 'high',
    },
    ignorePaths: ['node_modules', 'dist', '**/*.test.ts', '**/*.spec.ts'],
    failOn: 'high',
  },
  null,
  2
);
