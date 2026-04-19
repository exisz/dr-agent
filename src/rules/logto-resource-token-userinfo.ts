import type { Rule, Finding, ScannedFile } from '../types.js';

// Rule: Logto resource access token used against /oidc/me (will 401)
// Detects when ALL THREE conditions match:
// 1. Logto JWKS/issuer detected in codebase
// 2. jwtVerify called with non-issuer audience (resource token)
// 3. Same codebase calls /oidc/me or /userinfo with Bearer token

export const logtoResourceTokenUserinfo: Rule = {
  id: 'logto-resource-token-userinfo',
  severity: 'high',
  title: 'Logto resource access token used against /oidc/me (will 401)',
  description: `Resource access tokens (audience = your API resource) are rejected by Logto's /oidc/me and /userinfo endpoints.
Those endpoints only accept OP-bound tokens (audience = Logto issuer/appId).
This means any attempt to fetch user profile (email, name) via /oidc/me using a resource token will always return 401 invalid_token.`,

  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];

    // Signals for the three conditions
    let hasLogtoEndpoint = false;
    let hasResourceAudience = false;
    let hasUserinfoCall = false;

    // Also track the bonus SPA warning
    let hasSpaLogtoScopes = false;
    let hasSpaLogtoResource = false;

    for (const file of files) {
      const c = file.content;

      // Condition 1: Logto endpoint markers
      if (
        /\/oidc\/jwks/.test(c) ||
        /LOGTO_ENDPOINT/.test(c) ||
        /LOGTO_ISSUER/.test(c) ||
        /logto\.app\/oidc/.test(c) ||
        /\.logto\.app/.test(c)
      ) {
        hasLogtoEndpoint = true;
      }

      // Condition 2: jwtVerify with non-issuer audience (resource token)
      // Pattern: jwtVerify(... audience: ... ) where audience is not the issuer var
      if (
        /jwtVerify\s*\(/.test(c) &&
        /audience\s*[:=]\s*(?!.*[Ii]ssuer)/.test(c) &&
        // Positive signal: audience set to something that looks like an API resource
        (/audience\s*[:=]\s*[`'"]https?:\/\/[^`'"]+[`'"]/.test(c) ||
          /LOGTO_API_RESOURCE|API_RESOURCE|RESOURCE_INDICATOR/.test(c))
      ) {
        hasResourceAudience = true;
      }

      // Condition 3: HTTP call to /oidc/me or /userinfo with Authorization: Bearer
      if (
        /\/oidc\/me|\/userinfo/.test(c) &&
        /Authorization.*Bearer/.test(c) &&
        // Not using a dedicated ID token variable
        !/[Ii]d[Tt]oken|idToken|X-[Ll]ogto|X-[Ii]d-[Tt]oken/.test(
          // Only check the section around the userinfo call
          c.slice(
            Math.max(0, c.search(/\/oidc\/me|\/userinfo/) - 500),
            c.search(/\/oidc\/me|\/userinfo/) + 500
          )
        )
      ) {
        hasUserinfoCall = true;
      }

      // Bonus: SPA Logto config with scopes=['email','profile'] AND resource
      if (
        /new\s+LogtoClient|createLogtoClient|useLogto/.test(c) &&
        /scopes\s*[:=].*['"](?:email|profile)['"]/.test(c) &&
        /resource\s*[:=]/.test(c)
      ) {
        hasSpaLogtoScopes = true;
        hasSpaLogtoResource = true;
      }
    }

    // Main finding: all three conditions
    if (hasLogtoEndpoint && hasResourceAudience && hasUserinfoCall) {
      findings.push({
        ruleId: 'logto-resource-token-userinfo',
        severity: 'high',
        title: 'Logto resource access token used against /oidc/me (will 401)',
        why: `Your backend verifies a resource access token (audience = API resource, not issuer) then calls /oidc/me or /userinfo with the same token.
Logto's userinfo endpoint REJECTS resource-bound tokens — only OP-bound tokens (audience = Logto issuer/appId) are accepted.
Result: email/profile lookup always returns 401 → user cannot be mapped → access denied despite valid JWT.`,
        fix: [
          'Pattern A (recommended): SPA sends the OP-bound ID token in a separate header (e.g. X-Logto-Id-Token or X-Id-Token). Backend calls getIdTokenClaims() on the client side and passes the raw ID token. Backend verifies it with audience = SPA appId and reads email from its claims.',
          'Pattern B: SPA calls getIdTokenClaims() once and POSTs email to a /bootstrap endpoint to create a User row. Subsequent requests use only the resource token (no userinfo lookup needed).',
          'Pattern C (Logto Pro): Enable "include user profile in access token" in Logto Console. This embeds profile claims in the resource token directly.',
          'Do NOT add scopes: ["email","profile"] to the SPA Logto config and expect them in the resource token — those are reserved OIDC scopes that only flow through the OP/userinfo channel.',
        ],
        references: [
          'https://github.com/exisz/dr-agent (rule: logto-resource-token-userinfo)',
          'https://docs.logto.io/docs/references/core/README/#get-oidcme',
          'https://openid.net/specs/openid-connect-core-1_0.html#UserInfo',
        ],
      });
    }

    // Bonus finding: SPA scopes + resource
    if (hasSpaLogtoScopes && hasSpaLogtoResource) {
      findings.push({
        ruleId: 'logto-resource-token-userinfo',
        severity: 'medium',
        title: 'Logto SPA: reserved OIDC scopes (email/profile) do not propagate to resource access tokens',
        why: `Your SPA Logto config requests scopes like "email" or "profile" AND configures a resource: for an API.
Those are reserved OIDC scopes — they flow through the OP/userinfo channel only and do NOT appear in the resource access token's scope claim.
The resource token will not contain email, name, or profile fields regardless of what scopes are requested.`,
        fix: [
          'Use getIdTokenClaims() in the SPA to read profile data from the ID token (not from the resource token).',
          'Send the raw ID token to your backend in a separate header (X-Id-Token) if backend needs user identity.',
        ],
        references: [
          'https://github.com/exisz/dr-agent (rule: logto-resource-token-userinfo)',
          'https://docs.logto.io/docs/recipes/protect-your-api/',
        ],
      });
    }

    return findings;
  },
};
