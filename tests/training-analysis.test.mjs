import test from 'node:test'
import assert from 'node:assert/strict'
import {analyzeTraining,localDay} from '../work/analyze-training.mjs'
const row={id:'test-1',exercise:'plank',endedAt:100,durationMs:120000,repCount:0,attemptCount:0,hold:{heldMs:30000,bestMs:20000},records:[]}
test('holding time excludes pauses and duplicate rows',()=>{
  const a=analyzeTraining([row,row]);assert.equal(a.count,1);assert.equal(a.totals.plank.heldSeconds,30);assert.equal(a.totals.plank.elapsedSeconds,120)
  assert.equal(localDay(Date.parse('2026-10-21T16:01:00Z')),'2026-10-22')
})
test('hints are not automatically failures; conflicting duplicate is rejected',()=>{
  const r={...row,exercise:'squat',repCount:1,attemptCount:1,records:[{valid:true,issue:'fast',minAngle:0}]}
  assert.equal(analyzeTraining([r]).issues.validWithHint,1)
  assert.throws(()=>analyzeTraining([row,{...row,repCount:1}]))
})
