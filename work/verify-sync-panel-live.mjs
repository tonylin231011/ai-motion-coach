// Mount the actual React SyncPanel in isolated DOMs; use real HTTP/CloudBase storage.
// This verifies component events/timers, not physical phone camera recognition.
import assert from 'node:assert/strict'
import {createRequire,Module} from 'node:module'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve,dirname,extname} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {transform} from 'esbuild'
import React from 'react'
import {createRoot} from 'react-dom/client'
const require=createRequire(import.meta.url)
const {JSDOM}=require(resolve(process.env.SYNC_TEST_RUNTIME,'node_modules/jsdom'))
const endpoint='https://nanbuqu-dashboard-d0drnae5202324-1433064673.ap-shanghai.app.tcloudbase.com/training-sync'
const origin='https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com'
const {writeToken}=JSON.parse(await readFile(process.env.SYNC_CREDENTIAL_FILE,'utf8'))
// Transform explicit permitted source files in memory: no bundler directory scan.
const sources=new Map(),modules=new Map()
for(const name of ['SyncPanel.tsx','sync.ts','history.ts','types.ts']) {
 const path=resolve('src',name)
 const result=await transform(await readFile(path,'utf8'),{loader:name.endsWith('.tsx')?'tsx':'ts',format:'cjs',jsx:'automatic'})
 sources.set(path,result.code)
}
function load(path) {
 if(!extname(path))path+='.ts'
 if(modules.has(path))return modules.get(path).exports
 const code=sources.get(path);if(!code)throw Error(`Unexpected source import: ${path}`)
 const mod=new Module(path);mod.filename=path;mod.paths=Module._nodeModulePaths(dirname(path));modules.set(path,mod)
 const original=mod.require.bind(mod)
 mod.require=s=>s.startsWith('.')?load(resolve(dirname(path),s)):original(s)
 mod._compile(code,path);return mod.exports
}
const {SyncPanel}=load(resolve('src/SyncPanel.tsx'))
const realFetch=globalThis.fetch
let fails=false,postAttempts=0
globalThis.fetch=async(url,opts)=>{if(opts?.method==='POST')postAttempts++;if(fails)throw new TypeError('controlled network outage');return realFetch(url,{...opts,headers:{...opts?.headers,Origin:origin}})}
async function waitFor(condition,label){const until=Date.now()+22000;while(Date.now()<until){if(condition())return;await new Promise(r=>setTimeout(r,50))}throw Error(`Timed out: ${label}`)}
function device(){
 const dom=new JSDOM('<div id="root"></div>',{url:origin+'/ai-motion-coach/',pretendToBeVisual:true})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.Event=dom.window.Event
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
 localStorage.setItem('motion-coach.sync.v1',JSON.stringify({endpoint,token:writeToken}))
 const root=createRoot(document.getElementById('root'))
 root.render(React.createElement(SyncPanel,{disabled:false,onSynced:()=>{}}))
 return {dom,root}
}
const ids=[`sync-ui-${randomUUID()}`,`sync-ui-${randomUUID()}`]
const owner='motion-coach-private-tonylin231011'
const cleanupPath=resolve(process.env.SYNC_ARTIFACT_DIR,'test-record-ids.json')
const old=JSON.parse(await readFile(cleanupPath,'utf8'))
await writeFile(cleanupPath,JSON.stringify([...old,...ids.map(id=>createHash('sha256').update(owner+'\0'+id).digest('hex'))]))
let active
try {
 active=device();await waitFor(()=>document.querySelector('[role=status]')?.textContent.includes('云端已同步'),'initial mount pull')
 const session=id=>({id,exercise:'squat',endedAt:Date.now(),durationMs:2000,repCount:1,attemptCount:1,records:[]})
 const a=session(ids[0]),b=session(ids[1])
 function save(row){const data=JSON.parse(localStorage.getItem('motion-coach.sessions.v1')||'[]');localStorage.setItem('motion-coach.sessions.v1',JSON.stringify([row,...data]));window.dispatchEvent(new Event('motion-coach:history'))}
 const acknowledged=id=>JSON.parse(localStorage.getItem('motion-coach.sync.ack.v1')||'{}')[id]
 save(a);await waitFor(()=>acknowledged(a.id),'actual component save listener upload')
 console.log('PASS actual React save-event listener uploads to real CloudBase')
 fails=true;save(b);await waitFor(()=>document.querySelector('[role=status]')?.textContent.includes('controlled network outage'),'failure visible')
 assert.equal(JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length,2)
 const before=postAttempts;fails=false
 await waitFor(()=>acknowledged(b.id),'automatic backoff retry without clicking')
 assert.ok(postAttempts>before)
 console.log('PASS actual React automatic retry timer recovers without manual sync')
 active.root.unmount();active.dom.window.close();active=device()
 await waitFor(()=>document.querySelector('[role=status]')?.textContent.includes('云端已同步'),'second independent DOM pull')
 const remote=JSON.parse(localStorage.getItem('motion-coach.sessions.v1'))
 for(const row of [a,b])assert.deepEqual(remote.find(s=>s.id===row.id),row)
 assert.equal(new Set(remote.map(s=>s.id)).size,remote.length)
 console.log('PASS actual React new-device mount downloads and deduplicates cloud history')
 await writeFile(resolve(process.env.SYNC_ARTIFACT_DIR,'panel-test-result.json'),JSON.stringify({actualComponent:true,actualRetryTimer:true,realCloud:true,independentDOMs:2,physicalPhones:false},null,2))
}finally{active?.root.unmount();active?.dom.window.close();globalThis.fetch=realFetch}
