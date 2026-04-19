# dr-agent AgentSkill

**Skill ID:** `dr-agent`  
**Version:** 0.1.0  
**Purpose:** Integrate dr-agent into an agent's development loop to catch common AI agent pitfalls before shipping.

---

## What is dr-agent?

`dr-agent` is a CLI that scans agent codebases for known pitfalls and anti-patterns. Think `brew doctor` or `flutter doctor` but for AI agent projects.

Install: `npm i -g dr-agent`

---

## When to Use This Skill

- Before committing backend auth code that integrates Logto SSO
- During PR review of any backend that verifies JWTs and calls userinfo endpoints
- As a pre-push hook on agent/backend projects

---

## Integration Patterns

### 1. Pre-push / Pre-commit

Add to your project's `package.json`:

```json
{
  "scripts": {
    "precommit": "dr-agent run --severity high"
  }
}
```

Or as a git pre-push hook:
```bash
#!/bin/sh
dr-agent run --severity high || exit 1
```

### 2. CI Check

```yaml
- name: dr-agent scan
  run: npx dr-agent run --severity medium --json > dr-agent-report.json
- name: Fail on high issues
  run: npx dr-agent run --severity high
```

### 3. Agent Dev Loop

When you've written or modified backend auth code:

```bash
dr-agent run ./src/middleware
dr-agent run ./src/auth
```

When reviewing unfamiliar auth patterns:
```bash
dr-agent explain logto-resource-token-userinfo
```

---

## Rules Reference

| Rule ID | Severity | Trigger |
|---------|----------|---------|
| `logto-resource-token-userinfo` | HIGH | Logto resource token used against /oidc/me |

### logto-resource-token-userinfo

**The pitfall:** Backend verifies a Logto resource access token (audience = API resource) then calls `/oidc/me` with the same token. This **always 401s** — Logto's userinfo endpoint only accepts OP-bound tokens.

**Detection triggers (all three must be present):**
1. JWKS URL or env var points to Logto (`LOGTO_ENDPOINT`, `LOGTO_ISSUER`, `*/oidc/jwks`)
2. `jwtVerify` called with audience ≠ issuer (resource token pattern)
3. HTTP call to `/oidc/me` or `/userinfo` using `Authorization: Bearer` with the same token

**Fix:** Send the ID token from the SPA in a separate header (`X-Id-Token`). Backend verifies it with `audience = SPA appId` and reads email from ID token claims.

---

## Output Format

```
✖ [HIGH] Logto resource access token used against /oidc/me (will 401)
  Rule: logto-resource-token-userinfo

  Why: ...
  Fix:
    • Pattern A: X-Id-Token header
    • Pattern B: bootstrap endpoint
    • Pattern C: Logto Pro setting
```

Use `--json` for machine-readable output.

---

## References

- GitHub: https://github.com/exisz/dr-agent
- npm: https://www.npmjs.com/package/dr-agent
- NEBULA-31 (Epic), NEBULA-32 (v0.1.0), NEBULA-30 (Pitfall #1 spec)
