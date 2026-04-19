import { logtoResourceTokenUserinfo } from './logto-resource-token-userinfo.js';
import type { Rule } from '../types.js';

export const rules: Rule[] = [
  logtoResourceTokenUserinfo,
];

export function getRuleById(id: string): Rule | undefined {
  return rules.find(r => r.id === id);
}
