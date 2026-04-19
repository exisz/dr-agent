import type { Rule, Finding, ScannedFile } from '../types.js';

/**
 * Rule: JWKS set created inside a request handler (not cached at module scope)
 * Severity: MEDIUM
 * Every request re-creates the JWKS client → hits the JWKS endpoint per request
 * → rate limits / slow auth.
 */
export const jwksNotCached: Rule = {
  id: 'jwks-not-cached',
  severity: 'medium',
  title: 'createRemoteJWKSet called inside request handler (not cached)',
  description: `createRemoteJWKSet (or equivalent JWKS client constructors) should be called once at module scope so the JWKS instance and its internal HTTP cache live for the process lifetime.
Calling it inside a middleware/handler function body creates a new instance on every request, hitting the JWKS endpoint each time — leading to rate limiting, latency, and unnecessary external calls.`,

  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];

    for (const file of files) {
      const lines = file.lines;

      // Find function bodies that contain createRemoteJWKSet
      // Heuristic: if createRemoteJWKSet appears after a function/arrow/async def
      // within an indented block (not at the top of file), flag it.

      let inFunctionDepth = 0;
      let braceDepth = 0;
      let functionStartDepth: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Track function entry (rough heuristic — not a full parser)
        if (
          /\b(async\s+)?function\b/.test(trimmed) ||
          /=>\s*\{/.test(trimmed) ||
          /\b(async\s+)?\([^)]*\)\s*\{/.test(trimmed) ||
          /\bapp\.(get|post|put|delete|use|all)\s*\(/.test(trimmed) ||
          /\brouter\.(get|post|put|delete|use|all)\s*\(/.test(trimmed)
        ) {
          functionStartDepth.push(braceDepth);
          inFunctionDepth++;
        }

        // Count braces
        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;
        braceDepth += opens - closes;

        // Pop function tracking when we close below its start depth
        while (
          functionStartDepth.length > 0 &&
          braceDepth <= functionStartDepth[functionStartDepth.length - 1]
        ) {
          functionStartDepth.pop();
          inFunctionDepth = Math.max(0, inFunctionDepth - 1);
        }

        // Flag createRemoteJWKSet (or createLocalJWKSet) inside a function
        if (
          inFunctionDepth > 0 &&
          /createRemoteJWKSet|createLocalJWKSet/.test(line)
        ) {
          findings.push({
            ruleId: 'jwks-not-cached',
            severity: 'medium',
            title: 'createRemoteJWKSet called inside request handler (not cached)',
            why: `createRemoteJWKSet at line ${i + 1} of ${file.path} is inside a function/handler body.
This creates a new JWKS client on every call, hitting the JWKS endpoint per request.
The jose library's built-in cache only works when the same JWKSSet instance is reused across calls.`,
            fix: [
              'Move createRemoteJWKSet(...) to module top-level (outside any function).',
              'Example: const JWKS = createRemoteJWKSet(new URL(JWKS_URI)); at the top of the file.',
              'The same module-level constant is then used inside jwtVerify(token, JWKS, ...) within handlers.',
            ],
            references: [
              'https://github.com/panva/jose/blob/main/docs/functions/jwks_remote.createRemoteJWKSet.md',
              'https://github.com/exisz/dr-agent',
            ],
            file: file.path,
            line: i + 1,
          });
          break; // one finding per file is enough
        }
      }
    }

    return findings;
  },
};
