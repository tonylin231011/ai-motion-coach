import { createRemoteJWKSet, jwtVerify } from 'jose'
export function createVerifier(config, keySet = createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration:5000, cooldownDuration:30000 })) {
  return async token => {
    const {payload} = await jwtVerify(token, keySet, {
      issuer:config.issuer, audience:config.resource, algorithms:['RS256','ES256'],
      requiredClaims:['exp','iat','sub','iss','aud'], clockTolerance:5, maxTokenAge:'1h',
    })
    if (!config.subjects.includes(payload.sub)) throw new Error('Owner not allowed')
    if (typeof payload.scope !== 'string' || !payload.scope.split(/\s+/).includes(config.scope)) throw new Error('Scope not allowed')
    return { subject:payload.sub, expiresAt:payload.exp }
  }
}
export function bearerMiddleware(config, verify) {
  return async (req,res,next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '')
    try {
      if (!match || match[1].length > 16384) throw new Error('Invalid bearer')
      res.locals.principal = await verify(match[1]); next()
    } catch {
      res.set('WWW-Authenticate', `Bearer resource_metadata="${config.metadataUrl}", scope="${config.scope}", error="invalid_token"`)
      res.status(401).json({error:'unauthorized'})
    }
  }
}
