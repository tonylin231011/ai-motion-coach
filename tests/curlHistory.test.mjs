import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// The browser build resolves extensionless TS imports; match it in this Node-only test.
registerHooks({resolve(specifier,context,next) {
  try { return next(specifier,context) }
  catch(error) {
    if(error.code==='ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.ts'))
      return next(`${specifier}.ts`,context)
    throw error
  }
}})
const {readHistory,saveSession}=await import('../src/history.ts')
const {buildHistoryExport}=await import('../src/historyExport.ts')
const {dailyActivity,dayKey}=await import('../src/activity.ts')

test('curl persistence, export and daily totals retain arm units; repeated IDs deduplicate',()=>{
  let storage='[]'
  globalThis.localStorage={getItem:()=>storage,setItem:(_,value)=>{storage=value}}
  const session={exercise:'dumbbell_curl',id:'curl-test',endedAt:Date.now(),durationMs:32100,
    repCount:3,attemptCount:4,curlCountUnit:'arm_reps',countMode:'completed',armCounts:{left:2,right:1},
    records:[{side:'left',durationMs:2000,minAngle:80,valid:true,issue:null}]}
  try {
    saveSession(session);saveSession(session)
    assert.equal(readHistory().length,1);assert.deepEqual(readHistory()[0],session)
    const payload=buildHistoryExport(readHistory())
    assert.deepEqual(payload.sessions[0].armCounts,session.armCounts)
    assert.equal(payload.sessions[0].curlCountUnit,'arm_reps')
    assert.equal(payload.sessions[0].records[0].side,'left')
    assert.equal(dailyActivity(readHistory()).get(dayKey(new Date(session.endedAt))).durationMs,32100)
    assert.ok(!JSON.stringify(payload).includes('weight_kg'))
    storage=JSON.stringify([{...session,armCounts:{left:2,right:2}}])
    assert.equal(readHistory().length,0)
    storage=JSON.stringify([{...session,curlCountUnit:undefined}])
    assert.equal(readHistory().length,0)
  } finally { delete globalThis.localStorage }
})
