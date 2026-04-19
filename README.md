# dr-agent

> 🩺 Doctor for AI agent codebases — catches common pitfalls before they cost you days.

[![npm version](https://badge.fury.io/js/dr-agent.svg)](https://www.npmjs.com/package/dr-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

dr-agent is a CLI + programmatic linter that catches real auth/infra pitfalls that are easy to miss but painful to debug — the kind that cost you hours of "it should work" before you find the root cause.

## Install

```bash
npm install -g dr-agent
# or use without installing
npx dr-agent run
```

## Quick Start

```bash
dr-agent run ./src          # scan a directory
dr-agent list-rules         # see all rules
dr-agent explain <rule-id>  # detailed fix for one rule
dr-agent init               # create a config file
```

## Rules

| ID | Severity | What it catches |
|----|----------|-----------------|
| `logto-resource-token-userinfo` | HIGH | Logto resource access token used against `/oidc/me` — always 401 |
| `oidc-resource-token-to-userinfo` | HIGH | Generic OIDC: resource-bound token used against `/userinfo` endpoint |
| `cors-missing-custom-auth-header` | HIGH | Custom `X-*` header sent by client but absent from CORS `allowedHeaders` |
| `stripe-webhook-after-json-body-parser` | HIGH | Stripe webhook registered after `express.json()` — signature verification always fails |
| `jwks-not-cached` | MEDIUM | `createRemoteJWKSet` called inside a request handler instead of module scope |

## CI Integration

### Exit Codes

By default, `dr-agent run` exits `1` if any HIGH severity issues are found:

```bash
dr-agent run ./src          # exits 1 on HIGH findings
dr-agent run --fail-on=medium  # exits 1 on MEDIUM or HIGH
dr-agent run --fail-on=none    # always exits 0 (never fails CI)
dr-agent run --no-fail         # alias for --fail-on=none
```

### GitHub Actions — SARIF Upload (recommended)

Use `--sarif` to generate a [SARIF 2.1.0](https://sarifweb.azurewebsites.net/) report and upload it to GitHub code scanning for inline annotations:

```yaml
name: dr-agent scan

on: [push, pull_request]

jobs:
  dr-agent:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4

      - name: Run dr-agent
        run: npx dr-agent run --sarif > dr-agent-results.sarif || true
        # `|| true` keeps the workflow green; the upload step shows annotations

      - name: Upload SARIF results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: dr-agent-results.sarif
```

### GitHub Actions — Simple Fail on Issues

```yaml
- name: Run dr-agent
  run: npx dr-agent run --fail-on=high
```

### JSON Output (for scripting)

```bash
dr-agent run --json > issues.json
# Output: [{ruleId, severity, file, line, column, message, fix, references}]
```

## Config File

Create `dr-agent.config.json` in your project root (or run `dr-agent init`):

```json
{
  "rules": {
    "logto-resource-token-userinfo": "high",
    "jwks-not-cached": "medium",
    "cors-missing-custom-auth-header": "high",
    "stripe-webhook-after-json-body-parser": "high",
    "oidc-resource-token-to-userinfo": "high"
  },
  "ignorePaths": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"],
  "failOn": "high"
}
```

**Precedence:** CLI flags > config file > defaults

Supported config filenames (checked in order):
- `dr-agent.config.json`
- `.dr-agent.json`

To disable a rule: set its value to `"off"`.

## Programmatic API

```typescript
import { runRules } from 'dr-agent';

const issues = await runRules({
  path: './src',
  rules: ['jwks-not-cached', 'cors-missing-custom-auth-header'], // optional filter
  ignorePaths: ['**/*.test.ts'],
  minSeverity: 'medium',
});

for (const issue of issues) {
  console.log(`[${issue.severity}] ${issue.ruleId} — ${issue.file}:${issue.line}`);
}
```

`runRules` returns `Promise<Finding[]>` where each `Finding` is:

```typescript
{
  ruleId: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  why: string;
  fix: string[];
  references: string[];
  file?: string;
  line?: number;
  column?: number;
  message?: string;
}
```

## How to Add a New Rule

1. Create `src/rules/your-rule-id.ts` implementing the `Rule` interface:

```typescript
import type { Rule, Finding, ScannedFile } from '../types.js';

export const yourRule: Rule = {
  id: 'your-rule-id',
  severity: 'high',    // high | medium | low | info
  title: 'Short title shown in output',
  description: 'Longer description for dr-agent explain',

  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];
    for (const file of files) {
      // Regex/line-based detection (no AST in v0.2)
      if (/bad-pattern/.test(file.content)) {
        findings.push({
          ruleId: 'your-rule-id',
          severity: 'high',
          title: 'Short title',
          why: 'Why this is a problem',
          fix: ['Step 1 to fix', 'Step 2 to fix'],
          references: ['https://docs.example.com/relevant-page'],
          file: file.path,
          line: 1, // set to the matching line number
        });
      }
    }
    return findings;
  },
};
```

2. Register it in `src/rules/index.ts`:

```typescript
import { yourRule } from './your-rule-id.js';
export const rules: Rule[] = [
  // ... existing rules
  yourRule,
];
```

3. Add fixtures:
   - `tests/fixtures/your-rule-id/bad/example.ts` — should trigger the rule
   - `tests/fixtures/your-rule-id/good/example.ts` — should NOT trigger the rule

4. Add tests in `test/rules.test.ts`.

5. Document the rule in this README's Rules table.

### Rule Guidelines

- **No heavy deps** — regex/line-based detection only for now (AST parser support is a v0.3 item)
- **Avoid false positives** — when in doubt, require multiple signals to fire
- **Each finding needs:** `why` (root cause), `fix` (actionable steps), `references` (docs links)
- **Include file + line** when detectable — helps users navigate to the problem

## CLI Reference

```
dr-agent run [path]           Scan for pitfalls (default: current dir)
  --json                      JSON array output
  --sarif                     SARIF 2.1.0 output (for GitHub code scanning)
  --severity <level>          Minimum severity to report (high|medium|low|info)
  --rules <ids>               Comma-separated rule IDs
  --fail-on <level>           Exit 1 threshold (high|medium|low|none) [default: high]
  --no-fail                   Never exit 1

dr-agent list-rules           List all rules
  --json                      JSON output

dr-agent explain <rule-id>    Detailed explanation and fix

dr-agent init                 Create dr-agent.config.json
  --force                     Overwrite existing config
```

## License

MIT © [Exis](https://github.com/exisz)
