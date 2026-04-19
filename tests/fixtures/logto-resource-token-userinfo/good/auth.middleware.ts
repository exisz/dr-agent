import { User } from '../models/user.model'
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose'
import axios from 'axios'

/**
 * Logto SSO JWT verification middleware (MAP-329).
 *
 * Replaces the legacy HS256 jsonwebtoken flow. The SPA now obtains an access
 * token from Logto (id.rollersoft.com.au) bound to the MapSpot API resource
 * (https://api.mapspot.net) and sends it as `Authorization: Bearer <token>`.
 *
 * We:
 *  1. JWKS-verify the access token (RS256) against Logto's well-known JWKS.
 *  2. Pull `sub` (Logto user id) and `email` from the token / userinfo.
 *  3. Upsert a local User by email so existing `req.user.id` (numeric DB id)
 *     consumers (resolvers, custom-points, etc.) keep working unchanged.
 *
 * We expose the same shape the legacy middleware did:
 *   req.user = { id: number, email: string, isPremium: boolean }
 *
 * Anonymous requests are allowed (`req.user` left undefined) — exactly like
 * the old `expressjwt({ credentialsRequired: false })` behaviour.
 */

const LOGTO_ENDPOINT = (process.env.LOGTO_ENDPOINT || 'https://id.rollersoft.com.au').replace(/\/$/, '')
const LOGTO_ISSUER = `${LOGTO_ENDPOINT}/oidc`
const LOGTO_JWKS_URI = `${LOGTO_ENDPOINT}/oidc/jwks`
const LOGTO_USERINFO_URI = `${LOGTO_ENDPOINT}/oidc/me`
const LOGTO_API_RESOURCE = process.env.LOGTO_API_RESOURCE || 'https://api.mapspot.net'
// MAP-344: SPA appId — used as the audience when verifying the ID token sent
// by the SPA in the X-Logto-Id-Token header. The resource access token's
// audience is LOGTO_API_RESOURCE; the ID token's audience is the appId.
const LOGTO_SPA_APP_ID = process.env.LOGTO_SPA_APP_ID || 'l373hah0ybizolggv60hc'

const JWKS = createRemoteJWKSet(new URL(LOGTO_JWKS_URI))

/**
 * In-memory cache: Logto sub -> { user, expiresAt }.
 * Keeps DB hits + userinfo calls down to ~1 per 5 min per user per pod.
 */
type CacheEntry = { user: { id: number; email: string; isPremium: boolean }; expiresAt: number }
const userCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000

async function getLocalUserForLogtoToken(
  token: string,
  sub: string,
  payloadEmail?: string,
  idToken?: string,
) {
  const cached = userCache.get(sub)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user
  }

  // Resolve email — prefer claim, fall back to /oidc/me userinfo (Logto access
  // tokens don't include email by default unless the resource is configured to
  // pass it through).
  let email = payloadEmail
  if (!email) {
    try {
      const { data } = await axios.get<{ sub: string; email?: string; name?: string }>(
        LOGTO_USERINFO_URI,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        },
      )
      email = data?.email
    } catch (e: any) {
      // Expected when `token` is a resource-bound access token (aud =
      // LOGTO_API_RESOURCE) — Logto's /oidc/me only accepts OP-bound tokens
      // and returns 401 invalid_token. We fall through to the ID-token path
      // below.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('logto userinfo lookup failed', sub, e?.response?.status, e?.message)
      }
    }
  }

  // MAP-344: ID-token fallback. The SPA sends the OP-bound ID token in
  // X-Logto-Id-Token; verifying it against Logto's JWKS lets us read email
  // even when the resource access token has no scope and /oidc/me rejects
  // the resource token.
  if (!email && idToken) {
    try {
      const { payload: idPayload } = await jwtVerify(idToken, JWKS, {
        issuer: LOGTO_ISSUER,
        audience: LOGTO_SPA_APP_ID,
      })
      if (String(idPayload.sub || '') !== sub) {
        console.warn('logto: id-token sub mismatch with access token', { tokenSub: sub, idTokenSub: idPayload.sub })
      } else if (typeof idPayload.email === 'string') {
        email = idPayload.email as string
      }
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('logto id-token verify failed', sub, e?.code || e?.message)
      }
    }
  }

  if (!email) {
    // Without an email we can't map to a User row. Caller will see no
    // req.user and any auth-gated resolver will 401, which is correct.
    return null
  }

  const existing = await User.findOneBy({ email })
  let user = existing
  if (!user) {
    user = User.create({ email, isConfirmed: true })
    await user.save()
    console.log('logto: created local user', { sub, email, id: user.id })
  }

  // Re-load to make sure isPremium getter is populated via @AfterLoad
  const fresh = await User.findOneBy({ id: user.id })
  const result = {
    id: fresh!.id,
    email: fresh!.email,
    isPremium: fresh!.isPremium,
  }
  userCache.set(sub, { user: result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}

export const jwt = async (req, res, next) => {
  const authHeader = req.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null

  if (!token) {
    return next()
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: LOGTO_ISSUER,
      audience: LOGTO_API_RESOURCE,
    })
    const sub = String(payload.sub || '')
    if (!sub) {
      return next()
    }
    const claimEmail = typeof payload.email === 'string' ? (payload.email as string) : undefined
    // MAP-344: SPA sends the OP-bound ID token in X-Logto-Id-Token so we can
    // resolve the user's email even though the resource access token omits it.
    const idTokenHeader = req.get('x-logto-id-token') || ''
    const idToken = idTokenHeader.trim() || undefined
    const localUser = await getLocalUserForLogtoToken(token, sub, claimEmail, idToken)
    if (localUser) {
      ;(req as any).user = localUser
    }
    return next()
  } catch (err: any) {
    // Invalid/expired token — surface nothing, behave as anonymous (matches
    // the previous middleware's `credentialsRequired: false` semantics).
    if (process.env.NODE_ENV !== 'production') {
      const decoded = (() => {
        try {
          return decodeJwt(token)
        } catch {
          return null
        }
      })()
      console.warn('logto jwt verify failed', err?.code || err?.message, { sub: decoded?.sub })
    }
    return next()
  }
}

// Ensure JWT user is valid
export const requiresAuth = (req, res, next): void => {
  if (!req.user) {
    return res.status(401).send({ error: 'Invalid credentials or you must be logged in!' })
  }
  next()
}

// Grab user from DB
export const populateUser = async (req, res, next): Promise<void> => {
  const { user } = req
  res.locals.user = await User.findOneBy({ id: user.id })
  next()
}
