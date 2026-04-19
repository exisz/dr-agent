// BAD: OIDC resource token used against /userinfo (generic, non-Logto)
// dr-agent should flag: oidc-resource-token-to-userinfo

import { createRemoteJWKSet, jwtVerify } from 'jose';
import axios from 'axios';

const JWKS = createRemoteJWKSet(new URL('https://example.auth0.com/.well-known/jwks.json'));
const ISSUER = 'https://example.auth0.com/';
const API_RESOURCE = 'https://api.myapp.com';
const USERINFO_ENDPOINT = 'https://example.auth0.com/userinfo';

export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.slice(7);
  if (!token) return next();

  // Verify resource-bound token (audience = API resource, not issuer)
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: 'https://api.myapp.com', // resource audience
  });

  // BAD: calling /userinfo with the resource-bound token
  const { data } = await axios.get(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${token}` },
  });

  req.user = { sub: payload.sub, email: data.email };
  next();
};
