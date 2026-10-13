// Real HTTPS/CloudBase integration; credentials are read only from an ignored local file.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
registerHooks({ resolve(s,c,next) { try { return next(s,c) } catch(e) { if(e.code==='ERR_MODULE_NOT_FOUND' && s.startsWith('.') && !s.endsWith('.ts')) return next(`${s}.ts`,c); throw e } } })
const {saveSession,readHistory}=await import('../src/history.ts')
const {configureSync,syncHistory}=await import('../src/sync.ts')
const endpoint='https://nanbuqu-dashboard-d0drnae5202324-1433064673.ap-shanghai.app.tcloudbase.com/training-sync'
const origin='https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com'
const {writeToken,readToken}=JSON.parse(await readFile(process.env.SYNC_CREDENTIAL_FILE,'utf8'))
const cfg={endpoint,token:writeToken}, realFetch=globalThis.fetch
const testIds=[]
const log=[]
const pass=x=>{log.push(x);console.log(`PASS ${x}`)}
async function request(method,token,body,extra={}) { return realFetch(endpoint,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)}) }
function device(){const m=new Map();globalThis.localStorage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};globalThis.window=new EventTarget();configureSync(cfg);return m}
function sample(exercise,extra={}) { const id=`sync-e2e-${randomUUID()}`;testIds.push(id);return {id,exercise,endedAt:Date.now(),durationMs:7000,repCount:2,attemptCount:2,records:[],...extra} }
const rows=[sample('squat'),sample('dumbbell_curl',{curlCountUnit:'arm_reps',armCounts:{left:1,right:1}}),sample('russian_twist',{twistCountUnit:'sides'}),sample('plank',{repCount:0,attemptCount:0,hold:{heldMs:62345,bestMs:62345,breaks:0,timerMode:'manual'},durationMs:70000})]
// Emit a precise cleanup manifest even if a later assertion fails. Never delete user history.
const owner='motion-coach-private-tonylin231011'
await writeFile(resolve(process.env.SYNC_ARTIFACT_DIR,'test-record-ids.json'),JSON.stringify(testIds.map(id=>createHash('sha256').update(owner+'\0'+id).digest('hex'))))
try {
 assert.equal((await request('GET')).status,401)
 assert.equal((await request('POST',readToken,{session:rows[0]})).status,403)
 assert.equal((await request('GET',writeToken,undefined,{Origin:'https://evil.example'})).status,403)
 const preflight=await request('OPTIONS',undefined,undefined,{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'})
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin)
 pass('HTTP gateway authentication, read-only restriction and browser CORS')
 const first=device();rows.forEach(saveSession)
 let posts=0
 globalThis.fetch=async(...args)=>{if(args[1]?.method==='POST')posts++;return realFetch(...args)}
 await syncHistory(cfg);assert.equal(posts,4)
 await syncHistory(cfg);assert.equal(posts,4)
 const detail=await realFetch(endpoint+'?details=1',{headers:{Authorization:`Bearer ${readToken}`},signal:AbortSignal.timeout(30000)})
 assert.equal(detail.status,200);const remote=await detail.json()
 for(const row of rows)assert.deepEqual(remote.sessions.find(s=>s.id===row.id),row)
 pass('Legacy batch migration preserves counts, arm units, twist sides and exact hold milliseconds')
 pass('Acknowledged records do not upload again; real database returns one row per ID')
 // Actual saveSession event starts a real HTTPS upload; no manual export or sync button.
 const ended=sample('pushup');await writeFile(resolve(process.env.SYNC_ARTIFACT_DIR,'test-record-ids.json'),JSON.stringify(testIds.map(id=>createHash('sha256').update(owner+'\0'+id).digest('hex'))))
 let pending
 window.addEventListener('motion-coach:history',()=>{pending=syncHistory(cfg)},{once:true})
 saveSession(ended);assert.ok(pending);await pending
 pass('Training-save event triggers immediate HTTPS synchronization')
 const failed=sample('reverse_crunch');await writeFile(resolve(process.env.SYNC_ARTIFACT_DIR,'test-record-ids.json'),JSON.stringify(testIds.map(id=>createHash('sha256').update(owner+'\0'+id).digest('hex'))))
 saveSession(failed);globalThis.fetch=async()=>{throw new TypeError('injected network outage')}
 await assert.rejects(syncHistory(cfg));assert.ok(readHistory().some(s=>s.id===failed.id))
 globalThis.fetch=realFetch;await syncHistory(cfg);await syncHistory(cfg)
 pass('Network outage keeps local history; real reconnection retries without duplicates')
 device();assert.equal(readHistory().length,0);await syncHistory(cfg)
 for(const row of [...rows,ended,failed])assert.deepEqual(readHistory().find(s=>s.id===row.id),row)
 await syncHistory(cfg)
 pass('Independent device storage downloads all records from real CloudBase')
 globalThis.localStorage={getItem:k=>first.get(k)??null,setItem:(k,v)=>first.set(k,v),removeItem:k=>first.delete(k)}
 configureSync(cfg);await syncHistory(cfg)
 const replay=await realFetch(endpoint+'?details=1',{headers:{Authorization:`Bearer ${readToken}`},signal:AbortSignal.timeout(30000)})
 const replayRows=(await replay.json()).sessions
 for(const id of testIds)assert.equal(replayRows.filter(s=>s.id===id).length,1)
 pass('Lost acknowledgements/reopened client resends safely using final session IDs')
 await writeFile(resolve(process.env.SYNC_ARTIFACT_DIR,'live-test-result.json'),JSON.stringify({passed:log,syntheticRecordCount:testIds.length,realCloud:true,physicalPhones:false},null,2))
} finally {globalThis.fetch=realFetch;delete globalThis.window}
