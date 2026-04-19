import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { logtoResourceTokenUserinfo } from '../src/rules/logto-resource-token-userinfo.js';
import { jwksNotCached } from '../src/rules/jwks-not-cached.js';
import { stripeWebhookAfterJsonBodyParser } from '../src/rules/stripe-webhook-after-json-body-parser.js';
import { oidcResourceTokenToUserinfo } from '../src/rules/oidc-resource-token-to-userinfo.js';
import { corsMissingCustomAuthHeader } from '../src/rules/cors-missing-custom-auth-header.js';
import type { ScannedFile } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(rulePath: string): ScannedFile {
  const fp = path.join(__dirname, '..', 'tests', 'fixtures', rulePath);
  const content = readFileSync(fp, 'utf-8');
  return { path: fp, content, lines: content.split('\n') };
}

// ── logto-resource-token-userinfo ──────────────────────────────────────────
describe('logto-resource-token-userinfo rule', () => {
  it('detects the anti-pattern in bad fixture', () => {
    const file = loadFixture('logto-resource-token-userinfo/bad/auth.middleware.ts');
    const findings = logtoResourceTokenUserinfo.check([file]);
    expect(findings.length).toBeGreaterThan(0);
    const main = findings.find(f => f.severity === 'high');
    expect(main).toBeDefined();
    expect(main!.ruleId).toBe('logto-resource-token-userinfo');
    expect(main!.title).toContain('will 401');
  });

  it('does NOT flag the good fixture (X-Id-Token pattern)', () => {
    const file = loadFixture('logto-resource-token-userinfo/good/auth.middleware.ts');
    const findings = logtoResourceTokenUserinfo.check([file]);
    const highFindings = findings.filter(f => f.severity === 'high');
    expect(highFindings.length).toBe(0);
  });

  it('rule has correct metadata', () => {
    expect(logtoResourceTokenUserinfo.id).toBe('logto-resource-token-userinfo');
    expect(logtoResourceTokenUserinfo.severity).toBe('high');
    expect(logtoResourceTokenUserinfo.title).toBeTruthy();
  });
});

// ── jwks-not-cached ────────────────────────────────────────────────────────
describe('jwks-not-cached rule', () => {
  it('detects createRemoteJWKSet inside handler (bad fixture)', () => {
    const file = loadFixture('jwks-not-cached/bad/auth.middleware.ts');
    const findings = jwksNotCached.check([file]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe('jwks-not-cached');
    expect(findings[0].severity).toBe('medium');
  });

  it('does NOT flag module-scope createRemoteJWKSet (good fixture)', () => {
    const file = loadFixture('jwks-not-cached/good/auth.middleware.ts');
    const findings = jwksNotCached.check([file]);
    expect(findings.length).toBe(0);
  });

  it('rule has correct metadata', () => {
    expect(jwksNotCached.id).toBe('jwks-not-cached');
    expect(jwksNotCached.severity).toBe('medium');
  });
});

// ── stripe-webhook-after-json-body-parser ──────────────────────────────────
describe('stripe-webhook-after-json-body-parser rule', () => {
  it('detects webhook after json parser (bad fixture)', () => {
    const file = loadFixture('stripe-webhook-after-json-body-parser/bad/app.ts');
    const findings = stripeWebhookAfterJsonBodyParser.check([file]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe('stripe-webhook-after-json-body-parser');
    expect(findings[0].severity).toBe('high');
  });

  it('does NOT flag webhook before json parser (good fixture)', () => {
    const file = loadFixture('stripe-webhook-after-json-body-parser/good/app.ts');
    const findings = stripeWebhookAfterJsonBodyParser.check([file]);
    expect(findings.length).toBe(0);
  });

  it('rule has correct metadata', () => {
    expect(stripeWebhookAfterJsonBodyParser.id).toBe('stripe-webhook-after-json-body-parser');
    expect(stripeWebhookAfterJsonBodyParser.severity).toBe('high');
  });
});

// ── oidc-resource-token-to-userinfo ───────────────────────────────────────
describe('oidc-resource-token-to-userinfo rule', () => {
  it('detects resource token + userinfo call (bad fixture)', () => {
    const file = loadFixture('oidc-resource-token-to-userinfo/bad/auth.middleware.ts');
    const findings = oidcResourceTokenToUserinfo.check([file]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe('oidc-resource-token-to-userinfo');
    expect(findings[0].severity).toBe('high');
  });

  it('does NOT flag ID-token pattern (good fixture)', () => {
    const file = loadFixture('oidc-resource-token-to-userinfo/good/auth.middleware.ts');
    const findings = oidcResourceTokenToUserinfo.check([file]);
    expect(findings.length).toBe(0);
  });
});

// ── cors-missing-custom-auth-header ───────────────────────────────────────
describe('cors-missing-custom-auth-header rule', () => {
  it('detects missing custom header in CORS allowedHeaders (bad fixture)', () => {
    const file = loadFixture('cors-missing-custom-auth-header/bad/app.ts');
    const findings = corsMissingCustomAuthHeader.check([file]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe('cors-missing-custom-auth-header');
    expect(findings[0].severity).toBe('high');
  });

  it('does NOT flag when custom header is in allowedHeaders (good fixture)', () => {
    const file = loadFixture('cors-missing-custom-auth-header/good/app.ts');
    const findings = corsMissingCustomAuthHeader.check([file]);
    expect(findings.length).toBe(0);
  });
});
