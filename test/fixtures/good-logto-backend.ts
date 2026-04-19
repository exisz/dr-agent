// GOOD fixture: does NOT match logto-resource-token-userinfo rule
// Uses the correct pattern: ID token from X-Id-Token header for user identity

import { createRemoteJWKSet, jwtVerify } from 'jose';

const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT;
const LOGTO_API_RESOURCE = process.env.LOGTO_API_RESOURCE;
const LOGTO_APP_ID = process.env.LOGTO_APP_ID;

const JWKS = createRemoteJWKSet(new URL(`${LOGTO_ENDPOINT}/oidc/jwks`));

export async function verifyToken(token: string, idToken: string) {
  // Verify resource access token for API authorization
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: LOGTO_ENDPOINT,
    audience: LOGTO_API_RESOURCE,
  });

  // Separately verify the OP-bound ID token sent in X-Id-Token header
  const { payload: idPayload } = await jwtVerify(idToken, JWKS, {
    issuer: LOGTO_ENDPOINT,
    audience: LOGTO_APP_ID,  // <-- OP-bound, correct
  });

  // Read email from ID token claims, NOT from resource token or /oidc/me
  const email = idPayload.email as string;

  return { payload, email };
}
