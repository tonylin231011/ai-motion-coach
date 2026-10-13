const { createHash, timingSafeEqual } = require('node:crypto')
const hash = value => createHash('sha256').update(value).digest('hex')
const exercises = ['squat','pushup','plank','russian_twist','reverse_crunch','dumbbell_curl','wall_sit']
const nonnegative = n => Number.isFinite(n) && n >= 0
function validSession(s) {
  if (!s || !/^[a-zA-Z0-9_-]{1,128}$/.test(s.id) || !exercises.includes(s.exercise)) return false
  if (![s.endedAt,s.durationMs,s.repCount,s.attemptCount].every(nonnegative) || !Number.isInteger(s.repCount) || !Number.isInteger(s.attemptCount) || s.repCount > s.attemptCount) return false
  if (!Array.isArray(s.records) || s.records.length > 10000 || !s.records.every(r => r && nonnegative(r.durationMs) && Number.isFinite(r.minAngle) && typeof r.valid === 'boolean' && [null,'shallow','fast'].includes(r.issue))) return false
  if (['plank','wall_sit'].includes(s.exercise) && (!s.hold || ![s.hold.heldMs,s.hold.bestMs,s.hold.breaks].every(nonnegative))) return false
  if (s.exercise === 'dumbbell_curl' && (s.curlCountUnit !== 'arm_reps' || !s.armCounts || ![s.armCounts.left,s.armCounts.right].every(n => Number.isInteger(n) && n >= 0) || s.armCounts.left+s.armCounts.right !== s.repCount)) return false
  if (s.exercise === 'russian_twist' && s.twistCountUnit !== 'sides') return false
  if (s.exercise === 'wall_sit') {
    const w = s.wallSit
    if (!w || !Number.isFinite(w.targetMs) || w.targetMs < 5000 || w.targetMs > 120000 || w.currentMs !== 0 || !Array.isArray(w.sets) || !w.sets.every(x => x && nonnegative(x.heldMs) && x.completed === (x.heldMs >= w.targetMs))) return false
    if (w.completedSets !== w.sets.filter(x=>x.completed).length || s.repCount !== w.completedSets || s.attemptCount !== w.sets.length || Math.abs(s.hold.heldMs-w.sets.reduce((n,x)=>n+x.heldMs,0)) > .01) return false
  }
  return true
}
// Personal deployment: one configured owner. Never trust a user/owner supplied by the client.
function createHandler({ store, env }) {
  return async event => {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v])=>[k.toLowerCase(),v]))
    const origin = headers.origin
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean)
    const cors = origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}
    const reply = (statusCode, data) => ({ statusCode, headers: { ...cors, 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type' }, body: JSON.stringify(data) })
    if (origin && !allowed.includes(origin)) return reply(403,{error:'origin_not_allowed'})
    if (event.httpMethod === 'OPTIONS') return reply(204,{})
    const writeHash = env.SYNC_WRITE_TOKEN_SHA256, readHash = env.SYNC_READ_TOKEN_SHA256
    if (!env.SYNC_OWNER_ID || !/^[a-f0-9]{64}$/.test(writeHash || '') || !/^[a-f0-9]{64}$/.test(readHash || '') || writeHash === readHash) return reply(503,{error:'not_configured'})
    const token = /^Bearer ([^\s]+)$/.exec(headers.authorization || '')?.[1]
    const matches = expected => token && timingSafeEqual(Buffer.from(hash(token),'hex'), Buffer.from(expected,'hex'))
    const writable = matches(writeHash)
    if (!writable && !matches(readHash)) return reply(401,{error:'unauthorized'})
    try {
      if (event.httpMethod === 'POST') {
        if (!writable) return reply(403,{error:'read_only'})
        if (typeof event.body !== 'string' || Buffer.byteLength(event.body) > 512000 || event.isBase64Encoded) return reply(400,{error:'invalid_body'})
        let s
        try { s = JSON.parse(event.body).session } catch { return reply(400,{error:'invalid_json'}) }
        if (!validSession(s)) return reply(400,{error:'invalid_session'})
        // Store only known training fields, excluding user-supplied database metadata.
        const fields = ['id','exercise','endedAt','durationMs','repCount','attemptCount','records','countMode','hold','wallSit','armCounts','curlCountUnit','twistCountUnit','legacyTwistPairs']
        const session = Object.fromEntries(fields.filter(k=>s[k] !== undefined).map(k=>[k,s[k]]))
        await store.put(hash(env.SYNC_OWNER_ID+'\0'+s.id), {owner:env.SYNC_OWNER_ID, session})
        return reply(200,{savedId:s.id})
      }
      if (event.httpMethod !== 'GET') return reply(405,{error:'method_not_allowed'})
      const q = event.queryStringParameters || {}
      if (q.cursor && !/^[a-f0-9]{64}$/.test(q.cursor)) return reply(400,{error:'invalid_cursor'})
      const rows = await store.list(env.SYNC_OWNER_ID, q.cursor || '', 100)
      const sessions = rows.map(({session:s}) => {
        if (q.details === '1') return s
        const {records, ...summary} = s
        return {...summary, localDate:new Date(s.endedAt+8*3600000).toISOString().slice(0,10), qualityHints:{fast:records.filter(r=>r.issue==='fast').length, shallow:records.filter(r=>r.issue==='shallow').length}, qualityHintsAreFailures:false}
      })
      return reply(200,{schemaVersion:1, timezone:'Asia/Shanghai', sessions, nextCursor:rows.length === 100 ? rows.at(-1)._id : null})
    } catch { return reply(503,{error:'storage_unavailable'}) }
  }
}
module.exports = { createHandler, validSession }
