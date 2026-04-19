import type { Rule, Finding, ScannedFile } from '../types.js';

/**
 * Rule: Custom auth header sent in requests but missing from CORS allowedHeaders
 * Severity: HIGH
 *
 * If a client sends a custom header (X-*-Token, X-*-Id, X-*-Auth, X-*-Key)
 * and the server configures CORS with an explicit allowedHeaders array that
 * does NOT include that header, the CORS preflight will reject it and the
 * browser silently drops the header — auth fails without an obvious error.
 *
 * Note: this rule requires BOTH client-side code (fetch/axios with custom header)
 * AND server-side code (cors({ allowedHeaders: [...] })) in the scanned files.
 * Single-repo (monorepo) setups are the primary use case.
 */
export const corsMissingCustomAuthHeader: Rule = {
  id: 'cors-missing-custom-auth-header',
  severity: 'high',
  title: 'Custom auth header sent by client but missing from CORS allowedHeaders',
  description: `Client code adds a custom X-* header to fetch/axios requests, but the server cors({ allowedHeaders: [...] }) array does not include that header.
CORS preflight (OPTIONS) will reject the custom header → browser silently drops it → server never receives it → auth fails.
This is especially common with X-Logto-Id-Token, X-CSRF-Token, X-Api-Key patterns.`,

  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];

    // Collect custom headers sent by client code
    const clientHeaders = new Set<string>();
    // Collect headers listed in cors({ allowedHeaders: [...] })
    const corsAllowedHeaders = new Set<string>();
    let hasCorsAllowedHeaders = false;
    let corsLine = -1;
    let corsFile = '';

    const customHeaderPattern = /['"`]([xX]-[a-zA-Z][a-zA-Z0-9-]*(?:-token|-id|-auth|-key|-signature)?)['"` ]/g;

    for (const file of files) {
      const c = file.content;
      const lines = file.lines;

      // Client-side: headers in fetch/axios
      if (
        /fetch\s*\(|axios\.(get|post|put|delete|patch|request)|axios\s*\(/.test(c) ||
        /headers\s*[:=]\s*\{/.test(c)
      ) {
        let m: RegExpExecArray | null;
        const re = /['"`]([xX]-[a-zA-Z][a-zA-Z0-9-]*)['"`]/g;
        while ((m = re.exec(c)) !== null) {
          // Only flag if it's in a headers context (rough check)
          const around = c.slice(Math.max(0, m.index - 200), m.index + 100);
          if (/headers/.test(around)) {
            clientHeaders.add(m[1].toLowerCase());
          }
        }
      }

      // Server-side: cors({ allowedHeaders: [...] })
      if (/cors\s*\(/.test(c) && /allowedHeaders/.test(c)) {
        hasCorsAllowedHeaders = true;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/allowedHeaders/.test(line) && !/^\s*\/\//.test(line)) {
            if (corsLine === -1) {
              corsLine = i + 1;
              corsFile = file.path;
            }
            // Extract headers from the array on this and next few lines
            const block = lines.slice(i, Math.min(lines.length, i + 10)).join('\n');
            let hm: RegExpExecArray | null;
            const hre = /['"`]([a-zA-Z][a-zA-Z0-9-]*)['"`]/g;
            while ((hm = hre.exec(block)) !== null) {
              corsAllowedHeaders.add(hm[1].toLowerCase());
            }
          }
        }
      }
    }

    if (!hasCorsAllowedHeaders || clientHeaders.size === 0) {
      // Can't evaluate: either no explicit allowedHeaders or no custom client headers found
      return findings;
    }

    const missing: string[] = [];
    for (const header of clientHeaders) {
      if (header.startsWith('x-') && !corsAllowedHeaders.has(header)) {
        // Reconstruct original casing from files for display
        missing.push(header);
      }
    }

    if (missing.length > 0) {
      findings.push({
        ruleId: 'cors-missing-custom-auth-header',
        severity: 'high',
        title: 'Custom auth header sent by client but missing from CORS allowedHeaders',
        why: `Client code sends custom header(s): ${missing.map(h => `"${h}"`).join(', ')}
Server configures cors({ allowedHeaders: [...] }) without those headers.
CORS preflight will reject them → browser silently drops them → server never receives auth data.`,
        fix: [
          `Add the missing header(s) to your CORS allowedHeaders array: ${missing.map(h => `"${h}"`).join(', ')}`,
          `Or remove allowedHeaders entirely from your cors() config to use the default reflective behavior (the server mirrors back whatever the client requests).`,
          `Example: cors({ allowedHeaders: ['Content-Type', 'Authorization', ${missing.map(h => `'${h}'`).join(', ')}] })`,
        ],
        references: [
          'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Headers',
          'https://www.npmjs.com/package/cors#configuration-options',
          'https://github.com/exisz/dr-agent',
        ],
        file: corsFile || undefined,
        line: corsLine > 0 ? corsLine : undefined,
      });
    }

    return findings;
  },
};
