// Rule: Logto SPA misconfiguration — post_logout_redirect_uri
//
// When using @logto/browser's signOut(redirectUri), the passed URI must be
// registered in Logto Console as a "Post sign-out redirect URI".
// AI agents frequently hardcode a URI in signOut() that doesn't match
// what's registered, causing: oidc.invalid_request: post_logout_redirect_uri not registered
//
// This rule detects:
//   1. signOut() called with a URI argument (potential mismatch risk)
//   2. postSignOutRedirectUri defined but not used in signOut()
//   3. signOut URI that differs from any defined postSignOutRedirectUri constant

import type { Rule, Finding, ScannedFile, RuleContext } from '../types.js';

export const logtoPostLogoutUri: Rule = {
  id: 'logto-post-logout-uri',
  severity: 'high',
  title: 'Logto SPA: post_logout_redirect_uri likely not registered (will 400)',
  description:
    'When @logto/browser signOut() receives a redirect URI, that URI must be registered ' +
    'in Logto Console under "Post sign-out redirect URIs". Hardcoded URIs in signOut() ' +
    'are a frequent source of "oidc.invalid_request: post_logout_redirect_uri not registered" errors.',

  check(files: ScannedFile[], _ctx?: RuleContext): Finding[] {
    const findings: Finding[] = [];

    // Only scan if this looks like a Logto SPA project
    const hasLogto = files.some(f =>
      f.content.includes('@logto/browser') || f.content.includes('LogtoClient'),
    );
    if (!hasLogto) return findings;

    let signOutWithUri: { file: string; line: number; uri: string } | null = null;
    let postLogoutDefined: { file: string; line: number; varName: string } | null = null;
    let signOutNoArgs = false;

    for (const file of files) {
      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i];
        const lineNum = i + 1;

        // Detect signOut with a URI argument
        const signOutMatch = line.match(/\.signOut\(\s*[`'"]/);
        if (signOutMatch) {
          const uriMatch = line.match(/\.signOut\(\s*([`'"][^`'"]*[`'"]|[^)]+)\s*\)/);
          signOutWithUri = {
            file: file.path,
            line: lineNum,
            uri: uriMatch ? uriMatch[1].trim() : '(dynamic)',
          };
        }

        // Detect signOut() with no args
        if (/\.signOut\(\s*\)/.test(line)) {
          signOutNoArgs = true;
        }

        // Detect postSignOutRedirectUri or similar constant defined but maybe unused
        const postLogoutMatch = line.match(
          /(?:const|let|var|export\s+(?:const|let))\s+(postSignOutRedirectUri|postLogoutUri|signOutUri)\s*=/,
        );
        if (postLogoutMatch) {
          postLogoutDefined = {
            file: file.path,
            line: lineNum,
            varName: postLogoutMatch[1],
          };
        }
      }
    }

    // Case 1: signOut() with hardcoded URI — high risk of mismatch
    if (signOutWithUri) {
      const extra = postLogoutDefined
        ? `\nNote: ${postLogoutDefined.varName} is defined at ${postLogoutDefined.file}:${postLogoutDefined.line} but is NOT used in signOut(). This looks like a copy-paste bug.`
        : '';

      findings.push({
        ruleId: 'logto-post-logout-uri',
        severity: 'high',
        title: `Logto signOut() called with hardcoded URI — risk of "post_logout_redirect_uri not registered"`,
        why:
          `signOut(${signOutWithUri.uri}) at ${signOutWithUri.file}:${signOutWithUri.line} passes a redirect URI. ` +
          `This URI MUST be registered in Logto Console → Application → "Post sign-out redirect URIs". ` +
          `If it doesn't match exactly (including path, no trailing slash), Logto returns 400 invalid_request.` +
          extra,
        fix: [
          'Option A (safest): Call signOut() with no arguments — Logto handles redirect to its default logout page.',
          'Option B: Ensure the URI passed to signOut() is EXACTLY registered in Logto Console under "Post sign-out redirect URIs" (including protocol, host, port, path — no trailing slash difference).',
          `Option C: If you have a ${postLogoutDefined?.varName ?? 'postSignOutRedirectUri'} constant, use it in signOut() instead of a hardcoded string, and register that value in Logto Console.`,
          'After signOut completes, use client-side routing to redirect to your login page if needed.',
        ],
        references: [
          'https://docs.logto.io/sdk/spa/vanilla-js/#sign-out',
          'https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout',
        ],
        file: signOutWithUri.file,
        line: signOutWithUri.line,
      });
    }

    // Case 2: postSignOutRedirectUri defined but signOut has no args (not using it)
    if (postLogoutDefined && signOutNoArgs && !signOutWithUri) {
      findings.push({
        ruleId: 'logto-post-logout-uri',
        severity: 'low',
        title: `Unused ${postLogoutDefined.varName} — defined but not passed to signOut()`,
        why:
          `${postLogoutDefined.varName} is defined at ${postLogoutDefined.file}:${postLogoutDefined.line} ` +
          `but signOut() is called without arguments. The variable is dead code.`,
        fix: [
          `Either pass ${postLogoutDefined.varName} to signOut() and register it in Logto Console,`,
          `or remove the unused constant to reduce confusion.`,
        ],
        references: [],
        file: postLogoutDefined.file,
        line: postLogoutDefined.line,
      });
    }

    return findings;
  },
};
