// Mount the actual React SyncPanel in isolated DOMs; use real HTTP/CloudBase storage.
// This verifies component events/timers, not physical phone camera recognition.
import assert from 'node:assert/strict'
import {createRequire,Module} from 'node:module'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve,dirname,extname} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {transform} from 'esbuild'
import React from 'react'
const require=createRequire(import.meta.url)
const {JSDOM}=require(resolve(process.env.SYNC_TEST_RUNTIME,'node_modules/jsdom'))
const boot=new JSDOM('<div id="root"></div>',{url:'https://coach.example/',pretendToBeVisual:true})
globalThis.window=boot.window;globalThis.document=boot.window.document;globalThis.Event=boot.window.Event
const {createRoot}=await import('react-dom/client')
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
let fails=false,postAttempts=0,requests=0
globalThis.fetch=async(url,opts)=>{requests++;if(opts?.method==='POST')postAttempts++;if(fails)throw new TypeError('controlled network outage');return realFetch(url,{...opts,headers:{...opts?.headers,Origin:origin}})}
async function waitFor(condition,label){const until=Date.now()+22000;while(Date.now()<until){if(condition())return;await new Promise(r=>setTimeout(r,50))}throw Error(`Timed out: ${label}`)}
function device(connected=true){
 const dom=new JSDOM('<div id="root"></div>',{url:origin+'/ai-motion-coach/',pretendToBeVisual:true})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.Event=dom.window.Event
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
 if(connected)localStorage.setItem('motion-coach.sync.v1',JSON.stringify({endpoint,token:writeToken}))
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
const modern={any:Object.getOwnPropertyDescriptor(AbortSignal,'any'),timeout:Object.getOwnPropertyDescriptor(AbortSignal,'timeout'),throwing:Object.getOwnPropertyDescriptor(AbortSignal.prototype,'throwIfAborted')}
try {
 Object.defineProperty(AbortSignal,'any',{configurable:true,value:undefined})
 Object.defineProperty(AbortSignal,'timeout',{configurable:true,value:undefined})
 Object.defineProperty(AbortSignal.prototype,'throwIfAborted',{configurable:true,value:undefined})
 active=device(false);await waitFor(()=>document.querySelector('form'),'unconfigured form')
 assert.ok(document.querySelector('form').noValidate)
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
 const feedback=()=>document.querySelector('[role=status]')?.textContent||''
 const idle=()=>button('重新连接并同步历史')&&!button('重新连接并同步历史').disabled&&feedback().includes('云端已同步')
 async function click(text){const target=button(text);assert.ok(target&&!target.disabled,`Button unavailable: ${text}`);target.click();await new Promise(r=>setTimeout(r,25))}
 async function field(selector,value){
   const input=document.querySelector(selector)
   Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value)
   input.dispatchEvent(new window.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,100))
 }
 await click('连接并同步历史')
 await waitFor(()=>feedback().includes('密钥不完整'),'explicit empty-key error')
 await field('input[type=password]',writeToken)
 await click('连接并同步历史')
 await waitFor(idle,'actual connect click on older browser APIs')
 assert.ok(document.querySelector('input[type=password]').value.length===0,'secret input should be cleared after safe storage')
 let beforeRequests=requests
 await waitFor(()=>button('重新连接并同步历史')&&!button('重新连接并同步历史').disabled,'reconnect available')
 await click('重新连接并同步历史')
 await waitFor(()=>requests>beforeRequests&&idle(),'reconnect with empty secret input')
 beforeRequests=requests
 await waitFor(()=>!button('立即同步').disabled,'sync now available');await click('立即同步')
 await waitFor(()=>requests>beforeRequests&&idle(),'actual sync-now button')
 const savedConfig=localStorage.getItem('motion-coach.sync.v1')
 await field('input[type=url]',endpoint+'-different')
 beforeRequests=requests;await click('重新连接并同步历史')
 await waitFor(()=>feedback().includes('密钥不完整'),'endpoint change must require secret again')
 assert.ok(requests===beforeRequests,'saved secret must not be sent to a different endpoint')
 assert.ok(localStorage.getItem('motion-coach.sync.v1')===savedConfig,'invalid reconnect must retain original configuration')
 await field('input[type=url]',endpoint);await click('重新连接并同步历史')
 await waitFor(idle,'original endpoint restored')
 console.log('PASS actual connect, empty-key reconnect, sync-now clicks and visible validation on older browser APIs')
 const originalRows=JSON.parse(localStorage.getItem('motion-coach.sessions.v1')||'[]').length
 const session=id=>({id,exercise:'squat',endedAt:Date.now(),durationMs:2000,repCount:1,attemptCount:1,records:[]})
 const a=session(ids[0]),b=session(ids[1])
 function save(row){const data=JSON.parse(localStorage.getItem('motion-coach.sessions.v1')||'[]');localStorage.setItem('motion-coach.sessions.v1',JSON.stringify([row,...data]));window.dispatchEvent(new Event('motion-coach:history'))}
 const acknowledged=id=>JSON.parse(localStorage.getItem('motion-coach.sync.ack.v1')||'{}')[id]
 save(a);await waitFor(()=>acknowledged(a.id),'actual component save listener upload')
 console.log('PASS actual React save-event listener uploads to real CloudBase')
 fails=true;save(b);await waitFor(()=>feedback().includes('无法连接云端'),'failure visible')
 assert.equal(JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length,originalRows+2)
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
}finally{
 active?.root.unmount();active?.dom.window.close();boot.window.close();globalThis.fetch=realFetch
 Object.defineProperty(AbortSignal,'any',modern.any);Object.defineProperty(AbortSignal,'timeout',modern.timeout)
 Object.defineProperty(AbortSignal.prototype,'throwIfAborted',modern.throwing)
}
