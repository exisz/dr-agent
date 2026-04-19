// BAD: createRemoteJWKSet called inside middleware handler (not module scope)
// dr-agent should flag: jwks-not-cached

import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URI = process.env.JWKS_URI || 'https://example.auth0.com/.well-known/jwks.json';

// BAD: JWKS created fresh on every request
export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.slice(7);
  if (!token) return next();

  const JWKS = createRemoteJWKSet(new URL(JWKS_URI)); // ← BAD: inside handler
  const { payload } = await jwtVerify(token, JWKS, { audience: 'https://api.example.com' });
  req.user = { sub: payload.sub };
  next();
};
