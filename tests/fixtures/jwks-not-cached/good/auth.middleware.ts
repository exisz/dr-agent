// GOOD: createRemoteJWKSet called at module scope (cached for process lifetime)
// dr-agent should NOT flag: jwks-not-cached

import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URI = process.env.JWKS_URI || 'https://example.auth0.com/.well-known/jwks.json';

// GOOD: module-level singleton
const JWKS = createRemoteJWKSet(new URL(JWKS_URI));

export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.slice(7);
  if (!token) return next();

  const { payload } = await jwtVerify(token, JWKS, { audience: 'https://api.example.com' });
  req.user = { sub: payload.sub };
  next();
};
