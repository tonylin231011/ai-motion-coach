import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import handler from '../cloudfunctions/training-sync/handler.cjs'
const write='w'.repeat(64), read='r'.repeat(64), hash=x=>createHash('sha256').update(x).digest('hex')
const session={id:'test-1',exercise:'squat',endedAt:1791860000000,durationMs:4000,repCount:1,attemptCount:1,records:[{durationMs:1200,minAngle:60,valid:true,issue:'fast'}]}
function fixture() {
  const rows=new Map()
  const run=handler.createHandler({env:{SYNC_OWNER_ID:'owner',SYNC_WRITE_TOKEN_SHA256:hash(write),SYNC_READ_TOKEN_SHA256:hash(read),ALLOWED_ORIGINS:'https://coach.example'},store:{
    async put(id,data){ rows.set(id,{_id:id,...data}) },
    async list(owner,cursor,limit){return [...rows.values()].filter(x=>x.owner===owner&&x._id>cursor).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,limit)},
  }})
  const request=(method,token=write,extra={})=>run({httpMethod:method,headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({session}),...extra})
  return {rows,request}
}
test('auth, read-only permissions, CORS and malformed bodies fail closed',async()=>{
  const {rows,request}=fixture()
  assert.equal((await request('GET','wrong')).statusCode,401)
  assert.equal((await request('POST',read)).statusCode,403)
  assert.equal((await request('POST',write,{headers:{origin:'https://evil.example',authorization:`Bearer ${write}`}})).statusCode,403)
  assert.equal((await request('POST',write,{body:'{'})).statusCode,400)
  assert.equal((await request('POST',write,{body:JSON.stringify({session:{...session,repCount:-1}})})).statusCode,400)
  assert.equal(rows.size,0)
})
test('retry deduplicates, summary retains units and hints do not mark failures',async()=>{
  const {rows,request}=fixture()
  await request('POST'); await request('POST')
  assert.equal(rows.size,1)
  const body=JSON.parse((await request('GET',read)).body)
  assert.equal(body.sessions[0].records,undefined)
  assert.equal(body.sessions[0].qualityHints.fast,1)
  assert.equal(body.sessions[0].qualityHintsAreFailures,false)
  assert.deepEqual(JSON.parse((await request('GET',read,{queryStringParameters:{details:'1'}})).body).sessions[0],session)
})
test('pagination traverses more than one page exactly once',async()=>{
  const {request}=fixture()
  for(let i=0;i<105;i++) await request('POST',write,{body:JSON.stringify({session:{...session,id:`test-${i}`}})})
  const first=JSON.parse((await request('GET',read)).body)
  const next=JSON.parse((await request('GET',read,{queryStringParameters:{cursor:first.nextCursor}})).body)
  assert.equal(first.sessions.length,100); assert.equal(next.sessions.length,5); assert.equal(next.nextCursor,null)
  assert.equal(new Set([...first.sessions,...next.sessions].map(s=>s.id)).size,105)
})
test('missing server configuration rejects all access',async()=>{
  const run=handler.createHandler({env:{},store:{}})
  assert.equal((await run({httpMethod:'GET'})).statusCode,503)
})
