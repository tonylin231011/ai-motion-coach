import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return next(`${s}.ts`,c);throw e}}})
const {saveSession,readHistory}=await import('../src/history.ts')
const {syncHistory,configureSync}=await import('../src/sync.ts')
const cfg={endpoint:'https://coach.example/api',token:'t'.repeat(64)}
const one={id:'one',exercise:'squat',endedAt:1000,durationMs:1000,repCount:1,attemptCount:1,records:[]}
function setup(){const map=new Map();globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};configureSync(cfg);return map}
test('offline failure survives reload; duplicate retry and remote-only device keep one copy',async()=>{
  setup();saveSession(one)
  globalThis.fetch=async()=>{throw new TypeError('offline')}
  await assert.rejects(syncHistory(cfg));assert.equal(readHistory().length,1)
  const remote=new Map();let posts=0
  globalThis.fetch=async(url,opts)=>{
    if(opts.method==='POST'){const {session}=JSON.parse(opts.body);posts++;remote.set(session.id,session);return Response.json({savedId:session.id})}
    return Response.json({sessions:[...remote.values()],nextCursor:null})
  }
  await syncHistory(cfg);await syncHistory(cfg);assert.equal(posts,1)
  setup();assert.equal(readHistory().length,0)
  await syncHistory(cfg);assert.deepEqual(readHistory(),[one]);assert.equal(posts,1)
  await syncHistory(cfg);assert.equal(posts,1)
})
test('session saved during network request remains pending and uploads next pass',async()=>{
  setup();saveSession(one);let added=false;const ids=[]
  globalThis.fetch=async(url,opts)=>{
    if(opts.method==='POST'){const {session}=JSON.parse(opts.body);ids.push(session.id);if(!added){saveSession({...one,id:'two'});added=true}return Response.json({savedId:session.id})}
    return Response.json({sessions:[one],nextCursor:null})
  }
  await syncHistory(cfg);assert.equal(readHistory().length,2)
  await syncHistory(cfg);assert.deepEqual(ids,['one','two'])
})
test('failed or mismatched acknowledgement never drops local history',async()=>{
  setup();saveSession(one);globalThis.fetch=async()=>Response.json({savedId:'other'})
  await assert.rejects(syncHistory(cfg));assert.deepEqual(readHistory(),[one])
  globalThis.fetch=async()=>new Response('',{status:401})
  await assert.rejects(syncHistory(cfg),/密钥/)
  assert.deepEqual(readHistory(),[one])
})
test('unsafe endpoint and short credential are rejected',()=>{
  setup();assert.throws(()=>configureSync({...cfg,endpoint:'http://example.com'}));assert.throws(()=>configureSync({...cfg,endpoint:'https://example.com/?token=secret'}));assert.throws(()=>configureSync({...cfg,token:'short'}))
})
