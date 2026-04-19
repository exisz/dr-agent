import type { Rule, Finding, ScannedFile } from '../types.js';

/**
 * Rule: OIDC resource token used against /userinfo or /oidc/me (provider-agnostic)
 * Severity: HIGH
 *
 * This is a generalization of logto-resource-token-userinfo.
 * Any OIDC provider: resource-bound access tokens (aud ≠ issuer) are
 * rejected by /userinfo endpoints. Only OP-bound tokens are accepted.
 */
export const oidcResourceTokenToUserinfo: Rule = {
  id: 'oidc-resource-token-to-userinfo',
  severity: 'high',
  title: 'OIDC resource access token used against /userinfo endpoint (will 401)',
  description: `Resource access tokens (audience = your API resource URL) are rejected by OIDC /userinfo endpoints.
Per the OIDC spec, /userinfo only accepts tokens where audience = the OP issuer or client_id.
This is not Logto-specific — Auth0, Okta, Azure AD, and all OIDC-compliant providers behave the same way.
Any backend that verifies a resource token then calls /userinfo with that same token will always get 401 invalid_token.`,

  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];

    let hasJwtVerifyWithResourceAudience = false;
    let hasUserinfoCall = false;
    let userinfoLine = -1;
    let userinfoFile = '';

    for (const file of files) {
      const c = file.content;
      const lines = file.lines;

      // Signal 1: jwtVerify/verify with resource-looking audience (not issuer)
      if (
        /jwtVerify\s*\(/.test(c) &&
        /audience\s*[:=]/.test(c) &&
        // The audience looks like an API URL resource (not a plain client_id)
        /audience\s*[:=]\s*[`'"]https?:\/\/[^`'"]+[`'"]/.test(c) &&
        // Not already caught by the more specific logto rule
        !/\.logto\.app|LOGTO_ENDPOINT|LOGTO_ISSUER/.test(c)
      ) {
        hasJwtVerifyWithResourceAudience = true;
      }

      // Signal 2: HTTP call to /userinfo or /oidc/me WITHOUT an id token header
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          /\/userinfo|\/oidc\/me/.test(line) &&
          /Authorization.*Bearer/.test(
            lines.slice(Math.max(0, i - 5), i + 5).join('\n')
          ) &&
          !/[Ii]d[Tt]oken|X-[Ii]d-[Tt]oken|X-[Ll]ogto/.test(
            lines.slice(Math.max(0, i - 10), i + 10).join('\n')
          )
        ) {
          hasUserinfoCall = true;
          userinfoLine = i + 1;
          userinfoFile = file.path;
          break;
        }
      }
    }

    if (hasJwtVerifyWithResourceAudience && hasUserinfoCall) {
      findings.push({
        ruleId: 'oidc-resource-token-to-userinfo',
        severity: 'high',
        title: 'OIDC resource access token used against /userinfo endpoint (will 401)',
        why: `A JWT is verified with an audience matching an API resource URL (not the OIDC issuer).
That same token is then passed to /userinfo or /oidc/me — which only accept OP-bound tokens.
The OIDC spec requires /userinfo to reject tokens whose audience is not the authorization server itself.
Result: email/profile lookup always returns 401 invalid_token regardless of requested scopes.`,
        fix: [
          'Send the OP-bound ID token in a separate header (e.g. X-Id-Token) alongside the resource access token.',
          'Verify the ID token with audience = client_id (SPA appId) and read email/profile claims from it.',
          'Do NOT call /userinfo with a resource-bound access token — it will never work.',
          'Alternative: use provider-specific "include user claims in access token" feature (check your provider docs).',
        ],
        references: [
          'https://openid.net/specs/openid-connect-core-1_0.html#UserInfo',
          'https://datatracker.ietf.org/doc/html/rfc9068 (JWT access tokens)',
          'https://github.com/exisz/dr-agent',
        ],
        file: userinfoFile || undefined,
        line: userinfoLine > 0 ? userinfoLine : undefined,
      });
    }

    return findings;
  },
};
