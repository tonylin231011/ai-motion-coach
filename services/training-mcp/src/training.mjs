export const EXERCISES = ['squat','pushup','plank','russian_twist','reverse_crunch','dumbbell_curl','wall_sit']
export const COUNTING_RULES = {
  dumbbell_curl:'arm_reps: each arm counts separately; preserve armCounts.left and armCounts.right; no inferred weight',
  russian_twist:'sides: each side counts once, not a full left-right cycle',
  timed:'plank and wall_sit use hold.heldMs as actual holding time; durationMs is elapsed session time including pauses',
  quality:'fast/shallow are hints, not failed repetitions or a failure rate; valid and issue can coexist',
}
export class QueryError extends Error {
  constructor(code) { super(code); this.code = code }
}
const keys = ['id','exercise','endedAt','durationMs','repCount','attemptCount','countMode','hold','wallSit','armCounts','curlCountUnit','twistCountUnit','legacyTwistPairs','qualityHints','qualityHintsAreFailures','localDate']
function summary(s) {
  const out = Object.fromEntries(keys.filter(k=>s[k] !== undefined).map(k=>[k,s[k]]))
  out.actualHeldMs = ['plank','wall_sit'].includes(s.exercise) ? s.hold?.heldMs ?? null : null
  out.countUnit = s.exercise==='dumbbell_curl' ? 'arm_reps' : s.exercise==='russian_twist' ? 'sides' : s.exercise==='wall_sit' ? 'sets' : s.exercise==='plank' ? 'milliseconds' : 'reps'
  out.qualityHintsAreFailures = false
  return out
}
export class TrainingReader {
  constructor({endpoint, readToken, fetchImpl = fetch, maxPages=20, maxBytes=10*1024*1024, timeoutMs=20000}) {
    Object.assign(this,{endpoint,readToken,fetchImpl,maxPages,maxBytes,timeoutMs})
  }
  async query(work) {
    const controller = new AbortController()
    let timer
    const timeout = new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new QueryError('upstream_timeout'))},this.timeoutMs)})
    const budget={bytes:0,signal:controller.signal}
    try { return await Promise.race([work(budget),timeout]) }
    catch(e) { if(e instanceof QueryError) throw e; throw new QueryError('upstream_unavailable') }
    finally { clearTimeout(timer);controller.abort() }
  }
  async page(cursor, details, budget) {
    const url = new URL(this.endpoint)
    if(cursor)url.searchParams.set('cursor',cursor)
    if(details)url.searchParams.set('details','1')
    const response=await this.fetchImpl(url,{method:'GET',headers:{Authorization:`Bearer ${this.readToken}`,Accept:'application/json'},redirect:'error',signal:budget.signal,cache:'no-store'})
    if(!response.ok)throw new QueryError(response.status===401||response.status===403?'upstream_auth_failed':'upstream_unavailable')
    if(!response.headers.get('content-type')?.includes('application/json'))throw new QueryError('invalid_upstream_response')
    if(Number(response.headers.get('content-length') || 0)>2*1024*1024)throw new QueryError('query_size_limit')
    let bytes=0;const chunks=[]
    const reader=response.body.getReader()
    try {
      for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;budget.bytes+=value.length
        if(bytes>2*1024*1024||budget.bytes>this.maxBytes)throw new QueryError('query_size_limit')
        chunks.push(value)
      }
    } finally { await reader.cancel().catch(()=>{}) }
    let body
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new QueryError('invalid_upstream_response')}
    if(body.schemaVersion!==1 || !Array.isArray(body.sessions) || body.sessions.length>100 || !(body.nextCursor===null || /^[a-f0-9]{64}$/.test(body.nextCursor)))throw new QueryError('invalid_upstream_response')
    for(const s of body.sessions){if(!s||typeof s.id!=='string'||!/^[\w-]{1,128}$/.test(s.id)||!EXERCISES.includes(s.exercise)||!Number.isFinite(s.endedAt)||!Number.isFinite(s.durationMs)||!Number.isInteger(s.repCount)||!Number.isInteger(s.attemptCount))throw new QueryError('invalid_upstream_response')}
    return body
  }
  async scan(budget, visit) {
    const cursors = new Set();const ids = new Set();let cursor='';let duplicates=0
    for(let p=0;p<this.maxPages;p++){
      const page=await this.page(cursor,false,budget)
      for(const s of page.sessions){if(ids.has(s.id)){duplicates++;continue}ids.add(s.id);const found=await visit(s,cursor);if(found)return {found,duplicates}}
      if(!page.nextCursor)return {duplicates}
      if(cursors.has(page.nextCursor))throw new QueryError('upstream_cursor_loop')
      cursors.add(page.nextCursor);cursor=page.nextCursor
    }
    // Existing API is hash-ordered, not date-ordered: never label a partial scan as recent history.
    throw new QueryError('scan_limit_exceeded')
  }
  async list({days,exercise,limit=50,offset=0,asOf=new Date().toISOString()}) {
    const end=Date.parse(asOf)
    const start=Math.floor((end+8*3600000)/86400000)*86400000-8*3600000-(days-1)*86400000
    return this.query(async budget=>{
      const matches=[]
      const {duplicates}=await this.scan(budget,s=>{if(s.endedAt>=start&&s.endedAt<=end&&(!exercise||s.exercise===exercise))matches.push(summary(s))})
      matches.sort((a,b)=>b.endedAt-a.endedAt||a.id.localeCompare(b.id))
      return {source:'CloudBase training-sync',timezone:'Asia/Shanghai',asOf,from:new Date(start).toISOString(),days,exercise:exercise??null,countingRules:COUNTING_RULES,completeScan:true,
        totalMatches:matches.length,duplicatesRemoved:duplicates,sessions:matches.slice(offset,offset+limit),nextOffset:offset+limit<matches.length?offset+limit:null}
    })
  }
  async detail({sessionId,recordOffset=0,recordLimit=100}) {
    return this.query(async budget=>{
      const {found}=await this.scan(budget,(s,cursor)=>s.id===sessionId?{cursor}:null)
      if(!found)return {found:false,sessionId,countingRules:COUNTING_RULES}
      const page=await this.page(found.cursor,true,budget)
      const s=page.sessions.find(s=>s.id===sessionId)
      if(!s)throw new QueryError('upstream_changed_retry')
      if(!Array.isArray(s.records)||s.records.length>10000)throw new QueryError('invalid_upstream_response')
      const records=s.records.slice(recordOffset,recordOffset+recordLimit).map(r=>Object.fromEntries(['side','durationMs','minAngle','valid','issue'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])))
      return {found:true,source:'CloudBase training-sync',session:summary(s),countingRules:COUNTING_RULES,records,recordOffset,totalRecords:s.records.length,nextRecordOffset:recordOffset+recordLimit<s.records.length?recordOffset+recordLimit:null}
    })
  }
}
