// Non-secret deployment preflight. Does not issue a token or claim a completed login.
import {loadConfig} from '../src/config.mjs'
try {
  const c=loadConfig(), u=new URL(c.issuer)
  const metadataUrl=`${u.origin}/.well-known/oauth-authorization-server${u.pathname==='/'?'':u.pathname.replace(/\/$/,'')}`
  const r=await fetch(metadataUrl,{signal:AbortSignal.timeout(10000),redirect:'error'})
  const m=await r.json()
  if(!r.ok||m.issuer!==c.issuer||!m.code_challenge_methods_supported?.includes('S256')||!m.response_types_supported?.includes('code')||!m.token_endpoint_auth_methods_supported?.length)throw Error()
  for(const field of ['authorization_endpoint','token_endpoint','jwks_uri'])if(new URL(m[field]).protocol!=='https:')throw Error()
  if(m.jwks_uri!==c.jwksUrl)throw Error()
  console.log('OAUTH_METADATA_PASSED; still verify real authorization code + PKCE, resource audience, subject allowlist, refresh and ChatGPT callback.')
} catch {console.error('OAUTH_METADATA_NOT_PASSED: configuration or provider metadata is missing/incompatible');process.exitCode=2}
