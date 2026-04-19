// GOOD: ID token verified separately for user info (not reusing resource token)
// dr-agent should NOT flag: oidc-resource-token-to-userinfo

import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://example.auth0.com/.well-known/jwks.json'));
const ISSUER = 'https://example.auth0.com/';
const CLIENT_ID = 'my-spa-client-id';

export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.slice(7);
  const idToken = req.headers['x-id-token'] as string;
  if (!token) return next();

  // Verify resource token
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: 'https://api.myapp.com',
  });

  // GOOD: verify ID token separately (audience = client_id) to get user claims
  if (idToken) {
    const { payload: idPayload } = await jwtVerify(idToken, JWKS, {
      issuer: ISSUER,
      audience: CLIENT_ID,
    });
    req.user = { sub: payload.sub, email: idPayload.email as string };
  }

  next();
};
