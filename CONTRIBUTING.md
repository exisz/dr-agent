# Contributing to dr-agent

Thank you for your interest in contributing!

## Adding a Rule

1. Create `src/rules/<your-rule-id>.ts` implementing the `Rule` interface from `src/types.ts`.
2. Export your rule and add it to `src/rules/index.ts`.
3. Add test fixtures in `test/fixtures/` — one "bad" (should match) and one "good" (should not match).
4. Add a test in `test/<your-rule-id>.test.ts`.
5. Update the Rules table in `README.md`.

### Rule Interface

```ts
interface Rule {
  id: string;         // kebab-case, e.g. "logto-resource-token-userinfo"
  severity: Severity; // 'high' | 'medium' | 'low' | 'info'
  title: string;      // Short one-liner
  description: string;
  check(files: ScannedFile[]): Finding[];
}
```

## Development

```bash
git clone https://github.com/exisz/dr-agent
cd dr-agent
npm install
npm test
npm run build
```

## Code Style

- TypeScript, ESM
- Keep rules focused and fast (regex/string matching preferred over AST for v0.x)
- Each finding must include: `why`, `fix[]`, and at least one `reference`

## Reporting Pitfalls

Open an issue describing:
- The pitfall pattern
- Why it's dangerous
- What the correct fix looks like
- Ideally: a code snippet showing bad vs good

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
