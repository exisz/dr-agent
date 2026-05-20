# dr-agent

[![npm version](https://img.shields.io/npm/v/dr-agent)](https://www.npmjs.com/package/dr-agent)
[![npm downloads](https://img.shields.io/npm/dm/dr-agent)](https://www.npmjs.com/package/dr-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/exisz/dr-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/exisz/dr-agent/actions/workflows/ci.yml)

**Doctor for AI agent codebases — catches common pitfalls before they cost you days.**

Inspired by `brew doctor` and `flutter doctor`. Run it against any codebase and get a report of known anti-patterns, with explanations and fixes.

---

## Install

```bash
npm i -g dr-agent
```

## Quick Start

```bash
# Scan current directory
dr-agent run

# Scan a specific path
dr-agent run ./my-project

# Get JSON output (for CI/scripting)
dr-agent run --json

# Only show high severity
dr-agent run --severity high

# List local/built-in rules
dr-agent list-rules

# Include fleet/global DNA rules when you intentionally want empire-wide checks
dr-agent run --global-dna

# Explain a specific rule
dr-agent explain logto-resource-token-userinfo
```

## Example Output

```
🩺 dr-agent scanning: ./my-backend

  312 files collected

✖ [HIGH] Logto resource access token used against /oidc/me (will 401)
  Rule: logto-resource-token-userinfo

  Why:
    Your backend verifies a resource access token (audience = API resource, not issuer) then
    calls /oidc/me or /userinfo with the same token.
    Logto's userinfo endpoint REJECTS resource-bound tokens — only OP-bound tokens are accepted.
    Result: email/profile lookup always returns 401 → user cannot be mapped → access denied.

  Fix:
    • Pattern A (recommended): SPA sends the OP-bound ID token in X-Logto-Id-Token header.
      Backend verifies with audience = SPA appId and reads email from ID token claims.
    • Pattern B: SPA calls getIdTokenClaims() once and POSTs email to a /bootstrap endpoint.
    • Pattern C (Logto Pro): Enable "include user profile in access token" in Logto Console.

  References:
    - https://github.com/exisz/dr-agent (rule: logto-resource-token-userinfo)
    - https://docs.logto.io/docs/references/core/README/#get-oidcme

Found 1 issue(s): 1 high
```

## Rules

| ID | Severity | Description |
|----|----------|-------------|
| `logto-resource-token-userinfo` | 🔴 high | Detects Logto resource access token used against `/oidc/me` — always 401s |

More rules coming. [Contribute a rule →](CONTRIBUTING.md)

## How It Works

dr-agent uses **file traversal + regex detection** (no AST overhead). Each rule is a module in `src/rules/` that receives the list of scanned files and returns findings.

Rules are scoped to the scanned project context. Per-repo DNA rules are loaded from `<scanRoot>/.dna/deprecated/`; fleet/global DNA rules from `~/.openclaw/.dna/deprecated/` are opt-in via `--global-dna` so unrelated projects do not report global machine/empire issues.

Skipped directories: `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`.

## Flags

| Flag | Description |
|------|-------------|
| `--json` | Output findings as JSON |
| `--severity <level>` | Minimum severity: `high`, `medium`, `low`, `info` |
| `--rules <id,id>` | Only run specific rules (comma-separated IDs) |
| `--global-dna` | Opt in to fleet/global DNA deprecated rules from `~/.openclaw/.dna/deprecated/` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Rule ideas and PRs welcome.

## License

MIT © Exis
