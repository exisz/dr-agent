// BAD fixture: matches logto-resource-token-userinfo rule
// All three conditions are present:
// 1. LOGTO_ENDPOINT env used
// 2. jwtVerify with audience = API resource (not issuer)
// 3. /oidc/me called with same Bearer token

import { createRemoteJWKSet, jwtVerify } from 'jose';
import axios from 'axios';

const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT;
const LOGTO_API_RESOURCE = process.env.LOGTO_API_RESOURCE; // e.g. https://api.example.com

const JWKS = createRemoteJWKSet(new URL(`${LOGTO_ENDPOINT}/oidc/jwks`));
const LOGTO_USERINFO_URI = `${LOGTO_ENDPOINT}/oidc/me`;

export async function verifyToken(token: string) {
  // Verifying a RESOURCE access token (audience = API resource, not issuer)
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: LOGTO_ENDPOINT,
    audience: LOGTO_API_RESOURCE,  // <-- resource audience
  });

  // No email in resource token, so dev tries to fetch from userinfo
  // Using the SAME resource token -- this ALWAYS 401s
  const { data } = await axios.get(LOGTO_USERINFO_URI, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return { payload, email: data?.email };
}
