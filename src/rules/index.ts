import { logtoResourceTokenUserinfo } from './logto-resource-token-userinfo.js';
import { jwksNotCached } from './jwks-not-cached.js';
import { stripeWebhookAfterJsonBodyParser } from './stripe-webhook-after-json-body-parser.js';
import { oidcResourceTokenToUserinfo } from './oidc-resource-token-to-userinfo.js';
import { corsMissingCustomAuthHeader } from './cors-missing-custom-auth-header.js';
import type { Rule } from '../types.js';

export const rules: Rule[] = [
  logtoResourceTokenUserinfo,
  oidcResourceTokenToUserinfo,
  jwksNotCached,
  corsMissingCustomAuthHeader,
  stripeWebhookAfterJsonBodyParser,
];

export function getRuleById(id: string): Rule | undefined {
  return rules.find(r => r.id === id);
}
