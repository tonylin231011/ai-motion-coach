import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const {createHandler}=createRequire(import.meta.url)('../cloudfunctions/training-sync/handler.cjs')
const schema=JSON.parse(await readFile(new URL('../integrations/gpt-action/openapi.json',import.meta.url),'utf8'))
test('Action exposes only authenticated summary GET on the existing endpoint',()=>{
  assert.equal(schema.openapi,'3.1.0')
  assert.deepEqual(Object.keys(schema.paths),['/training-sync'])
  const path=schema.paths['/training-sync'];assert.deepEqual(Object.keys(path),['get'])
  assert.deepEqual(path.get.parameters.map(p=>p.name),['cursor'])
  assert.equal(schema.components.securitySchemes.bearerAuth.scheme,'bearer')
  assert.deepEqual(schema.security,[{bearerAuth:[]}])
})
test('actual handler contract: summary retains hold, full-page cursor, read-only auth',async()=>{
  const token='test-read-not-a-secret',hash=s=>createHash('sha256').update(s).digest('hex')
  let page=0
  const handler=createHandler({env:{SYNC_OWNER_ID:'synthetic-owner',SYNC_READ_TOKEN_SHA256:hash(token),SYNC_WRITE_TOKEN_SHA256:hash('test-write-not-a-secret')},store:{
    put(){assert.fail('Action must never write')},
    async list(owner,cursor,limit){assert.equal(limit,100);if(page++) {assert.equal(cursor,'a'.repeat(64));return []}
      return Array.from({length:100},(_,i)=>({_id:'a'.repeat(64),session:{id:`synthetic-${i}`,exercise:'plank',endedAt:1,durationMs:120000,repCount:0,attemptCount:0,hold:{heldMs:30000,bestMs:30000,breaks:0},records:[]}}))}
  }})
  const request={httpMethod:'GET',headers:{Authorization:`Bearer ${token}`},queryStringParameters:{}}
  const first=JSON.parse((await handler(request)).body)
  for(const key of schema.components.schemas.Page.required)assert.ok(key in first)
  assert.equal(first.sessions.length,100);assert.equal(first.sessions[0].hold.heldMs,30000)
  assert.equal(first.sessions[0].records,undefined);assert.equal(first.sessions[0].qualityHintsAreFailures,false)
  const second=JSON.parse((await handler({...request,queryStringParameters:{cursor:first.nextCursor}})).body)
  assert.equal(second.nextCursor,null)
  assert.equal((await handler({...request,headers:{}})).statusCode,401)
  assert.equal((await handler({...request,httpMethod:'POST',body:'{}'})).statusCode,403)
})
