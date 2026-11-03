import {test} from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from 'jose'
import {createVerifier} from '../src/auth.mjs'
import {loadConfig} from '../src/config.mjs'
import {config,tokens} from './helpers.mjs'
test('verify issuer audience expiration scope signature and owner; reject static read token',async()=>{
  const {verify,sign}=await tokens();assert.equal((await verify(await sign())).subject,'owner')
  for(const change of [{iss:'https://evil.example/'},{aud:'another-api'},{exp:1},{scope:'training:write'},{sub:'other-user'},{exp:undefined},{iat:Math.floor(Date.now()/1000)-4000}])await assert.rejects(verify(await sign(change)))
  await assert.rejects(verify('cloudbase-read-token'));const valid=await sign();await assert.rejects(verify(valid.slice(0,-10)+'AAAAAAAAAA'))
})
test('production config fails closed without token/owner and refuses mismatched JWKS origin',()=>{
  const env={MCP_PUBLIC_URL:config.resource,OAUTH_ISSUER:config.issuer,OAUTH_JWKS_URL:config.jwksUrl,OAUTH_ALLOWED_SUBJECTS:'owner',TRAINING_READ_TOKEN:'x'.repeat(64)}
  assert.equal(loadConfig(env).resource,config.resource)
  for(const patch of [{TRAINING_READ_TOKEN:''},{OAUTH_ALLOWED_SUBJECTS:'*'},{OAUTH_JWKS_URL:'https://evil.example/jwks'},{MCP_PUBLIC_URL:'http://mcp.example/training-mcp/mcp'}])assert.throws(()=>loadConfig({...env,...patch}))
})
