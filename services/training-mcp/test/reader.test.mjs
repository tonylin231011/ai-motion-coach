import {test} from 'node:test'
import assert from 'node:assert/strict'
import {TrainingReader} from '../src/training.mjs'
const cursor='a'.repeat(64)
export const sample=(id='one',extra={})=>({id,exercise:'squat',endedAt:Date.parse('2026-10-14T01:00:00Z'),durationMs:9000,repCount:2,attemptCount:2,...extra})
const json=(sessions=[],nextCursor=null)=>Response.json({schemaVersion:1,sessions,nextCursor})
function reader(fetchImpl,extra={}){return new TrainingReader({endpoint:'https://upstream.example/training-sync',readToken:'server-only-secret',fetchImpl,...extra})}
test('empty history and missing detail are explicit',async()=>{const r=reader(async()=>json());assert.equal((await r.list({days:7})).totalMatches,0);assert.equal((await r.detail({sessionId:'missing'})).found,false)})
test('scan all hash-ordered pages, deduplicate IDs and paginate sorted results',async()=>{
  const requests=[]
  const r=reader(async(url,opts)=>{requests.push({url,opts});return url.searchParams.has('cursor')?json([sample('new'),sample('old',{endedAt:1})]):json([sample('old',{endedAt:1}),sample('same')],cursor)})
  const result=await r.list({days:7,asOf:'2026-10-14T04:00:00Z',limit:1})
  assert.equal(result.totalMatches,2);assert.equal(result.duplicatesRemoved,1);assert.equal(result.nextOffset,1);assert.equal(result.sessions[0].id,'new')
  assert.ok(requests.every(x=>x.opts.method==='GET'&&x.opts.redirect==='error'&&!x.url.href.includes('secret')))
  assert.ok(requests.every(x=>x.opts.headers.Authorization==='Bearer server-only-secret'))
})
test('Shanghai day boundary, future exclusions and exercise filter',async()=>{
  const r=reader(async()=>json([sample('in',{exercise:'pushup',endedAt:Date.parse('2026-10-13T16:00:00Z')}),sample('out',{exercise:'pushup',endedAt:Date.parse('2026-10-13T15:59:59Z')}),sample('other'),sample('future',{exercise:'pushup',endedAt:Date.parse('2026-10-14T09:00:00Z')})]))
  const result=await r.list({days:1,exercise:'pushup',asOf:'2026-10-14T04:00:00Z'});assert.deepEqual(result.sessions.map(x=>x.id),['in'])
})
test('preserve arm/side units, held time and hints; detail paginated',async()=>{
  const sessions=[sample('arms',{exercise:'dumbbell_curl',curlCountUnit:'arm_reps',armCounts:{left:1,right:1}}),sample('sides',{exercise:'russian_twist',twistCountUnit:'sides'}),sample('hold',{exercise:'plank',hold:{heldMs:1234,bestMs:1234,breaks:0}}),sample('wall',{exercise:'wall_sit',hold:{heldMs:2000,bestMs:2000,breaks:0}})]
  const records=[{side:'left',durationMs:400,minAngle:45,valid:true,issue:'fast'},{durationMs:500,minAngle:50,valid:true,issue:'shallow'}]
  const r=reader(async(url)=>json(sessions.map(s=>({...s,...(url.searchParams.get('details')?{records}:{qualityHints:{fast:1,shallow:1}})}))))
  const list=await r.list({days:7,asOf:'2026-10-14T04:00:00Z'})
  assert.deepEqual(list.sessions.find(s=>s.id==='arms').armCounts,{left:1,right:1});assert.equal(list.sessions.find(s=>s.id==='sides').countUnit,'sides');assert.equal(list.sessions.find(s=>s.id==='hold').actualHeldMs,1234)
  const d=await r.detail({sessionId:'arms',recordLimit:1});assert.equal(d.records[0].valid,true);assert.equal(d.records[0].issue,'fast');assert.equal(d.nextRecordOffset,1);assert.equal(d.session.qualityHintsAreFailures,false)
})
test('page cap and repeated cursor fail instead of returning incomplete recent history',async()=>{
  await assert.rejects(reader(async()=>json([],cursor),{maxPages:1}).list({days:7}),/scan_limit_exceeded/)
  await assert.rejects(reader(async()=>json([],cursor)).list({days:7}),/upstream_cursor_loop/)
})
test('upstream errors, malformed payload and body budget are sanitized',async()=>{
  for(const [response,code] of [[new Response('private',{status:401}),'upstream_auth_failed'],[Response.json({schemaVersion:1,sessions:[{}],nextCursor:null}),'invalid_upstream_response'],[Response.json({schemaVersion:1,sessions:[],nextCursor:null,padding:'x'.repeat(1000)}),'query_size_limit']]) {
    await assert.rejects(reader(async()=>response,{maxBytes:500}).list({days:7}),new RegExp(code))
  }
})
test('deadline includes stalled network',async()=>{await assert.rejects(reader(()=>new Promise(()=>{}),{timeoutMs:20}).list({days:7}),/upstream_timeout/)})
