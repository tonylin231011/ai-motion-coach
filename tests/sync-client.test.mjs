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

test('a cancelled request cannot acknowledge a late response',async()=>{
  setup();saveSession(one)
  const controller=new AbortController()
  let finish
  globalThis.fetch=()=>new Promise(resolve=>{finish=resolve})
  const syncing=syncHistory(cfg,controller.signal)
  const rejected=assert.rejects(syncing,{name:'AbortError'})
  controller.abort();finish(Response.json({savedId:one.id}));await rejected
  assert.equal(localStorage.getItem('motion-coach.sync.ack.v1'),null)
  assert.deepEqual(readHistory(),[one])
})

test('a stalled phone request times out even if fetch ignores abort',async t=>{
  setup();saveSession(one)
  t.mock.timers.enable({apis:['setTimeout']})
  globalThis.fetch=()=>new Promise(()=>{})
  const syncing=syncHistory(cfg,new AbortController().signal)
  const rejected=assert.rejects(syncing,/15秒/)
  t.mock.timers.tick(15000);await rejected
  assert.equal(localStorage.getItem('motion-coach.sync.ack.v1'),null)
  assert.deepEqual(readHistory(),[one])
})

test('a stalled response body also has a bounded timeout',async t=>{
  setup();saveSession(one)
  t.mock.timers.enable({apis:['setTimeout']})
  globalThis.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})})
  const syncing=syncHistory(cfg)
  const rejected=assert.rejects(syncing,/15秒/)
  await Promise.resolve();await Promise.resolve()
  t.mock.timers.tick(15000);await rejected
  assert.deepEqual(readHistory(),[one])
})

test('upload progress is explicit; short or whitespace-only secrets do not replace a saved connection',async()=>{
  setup();saveSession(one)
  assert.throws(()=>configureSync({...cfg,token:' '.repeat(64)}),/密钥/)
  assert.throws(()=>configureSync({...cfg,token:'x'.repeat(32)+' '+'y'.repeat(32)}),/密钥/)
  const updates=[]
  globalThis.fetch=async(url,options)=>options.method==='POST'?Response.json({savedId:one.id}):Response.json({sessions:[one],nextCursor:null})
  await syncHistory(cfg,undefined,p=>updates.push(p))
  assert.deepEqual(updates.slice(0,2),[{stage:'uploading',completed:0,total:1},{stage:'uploading',completed:1,total:1}])
  assert.equal(updates.at(-1).stage,'reading')
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

test('older phone browsers can sync without AbortSignal.any, timeout or throwIfAborted',async()=>{
  setup();saveSession(one)
  const any=Object.getOwnPropertyDescriptor(AbortSignal,'any'),timeout=Object.getOwnPropertyDescriptor(AbortSignal,'timeout')
  const throwing=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'throwIfAborted')
  let posts=0
  globalThis.fetch=async(url,options)=>{
    assert.ok(options.signal instanceof AbortSignal)
    if(options.method==='POST'){posts++;return Response.json({savedId:one.id})}
    return Response.json({sessions:[one],nextCursor:null})
  }
  try {
    Object.defineProperty(AbortSignal,'any',{configurable:true,value:undefined})
    Object.defineProperty(AbortSignal,'timeout',{configurable:true,value:undefined})
    Object.defineProperty(AbortSignal.prototype,'throwIfAborted',{configurable:true,value:undefined})
    await syncHistory(cfg,new AbortController().signal)
    assert.equal(posts,1);assert.deepEqual(readHistory(),[one])
  }finally{
    Object.defineProperty(AbortSignal,'any',any);Object.defineProperty(AbortSignal,'timeout',timeout)
    Object.defineProperty(AbortSignal.prototype,'throwIfAborted',throwing)
  }
})
