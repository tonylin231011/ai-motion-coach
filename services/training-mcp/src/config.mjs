import { readFileSync } from 'node:fs'
export const SYNC_ENDPOINT = 'https://nanbuqu-dashboard-d0drnae5202324-1433064673.ap-shanghai.app.tcloudbase.com/training-sync'
export const SCOPE = 'training:read'
function https(value, name) {
  let url
  try { url = new URL(value) } catch { throw new Error(`${name} must be an HTTPS URL`) }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(`${name} must be a clean HTTPS URL`)
  return url
}
export function loadConfig(env = process.env) {
  const resource = https(env.MCP_PUBLIC_URL, 'MCP_PUBLIC_URL')
  if (resource.pathname !== '/training-mcp/mcp') throw new Error('MCP_PUBLIC_URL must end in /training-mcp/mcp')
  const issuer = https(env.OAUTH_ISSUER, 'OAUTH_ISSUER')
  const jwks = https(env.OAUTH_JWKS_URL, 'OAUTH_JWKS_URL')
  if (jwks.origin !== issuer.origin) throw new Error('JWKS must use the configured issuer origin')
  const subjects = (env.OAUTH_ALLOWED_SUBJECTS || '').split(',').map(x=>x.trim()).filter(Boolean)
  if (!subjects.length || subjects.includes('*')) throw new Error('An explicit owner subject allowlist is required')
  let readToken
  if (env.TRAINING_READ_TOKEN_FILE) {
    try { readToken = readFileSync(env.TRAINING_READ_TOKEN_FILE, 'utf8').trim() } catch { throw new Error('Cannot load server-side read token file') }
  } else readToken = env.TRAINING_READ_TOKEN?.trim()
  if (!readToken || readToken.length < 32 || /\s/.test(readToken)) throw new Error('Missing valid server-side TRAINING_READ_TOKEN or TRAINING_READ_TOKEN_FILE')
  const port = Number(env.PORT || 8080)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return { resource:resource.href, issuer:issuer.href, jwksUrl:jwks.href, subjects, readToken, endpoint:SYNC_ENDPOINT, port,
    metadataUrl:`${resource.origin}/.well-known/oauth-protected-resource/training-mcp/mcp`,
    allowedHosts:[resource.host], allowedOrigins:['https://chatgpt.com'], scope:SCOPE }
}
