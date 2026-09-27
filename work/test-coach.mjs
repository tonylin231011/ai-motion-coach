import assert from 'node:assert/strict'
import { SquatDetector } from './detector-test/coachDetector.js'
let time=1000
const points=(angle,confidence=1)=>{
 const r=angle*Math.PI/180
 return {left_hip:{x:.5+Math.sin(r)*.2,y:.5+Math.cos(r)*.2,z:0,visibility:confidence},left_knee:{x:.5,y:.5,z:0,visibility:confidence},left_ankle:{x:.5,y:.7,z:0,visibility:confidence}}
}
const hold=(d,a,n=5,dt=100)=>{let s;for(let i=0;i<n;i++){time+=dt;s=d.update(points(a),time)}return s}
const d=new SquatDetector()
hold(d,175)
hold(d,130);hold(d,90,8);hold(d,130)
let s=hold(d,175)
assert.equal(s.repCount,1);assert.equal(s.cue,'good1')
hold(d,130);s=hold(d,175);assert.equal(s.repCount,1);assert.equal(s.cue,'shallow')
hold(d,130);d.update({},time+=100);s=hold(d,175);assert.equal(s.repCount,1)
assert.equal(d.update(points(120,.1),time+=100).confidence,0)
d.reset();hold(d,175);hold(d,125,3,30);hold(d,85,7,30);s=hold(d,175,12,30);assert.equal(s.cue,'fast')
console.log('PASS: complete, shallow, tracking loss, low confidence, fast movement')
const rep=(d,angle,n=8)=>{hold(d,130);hold(d,angle,n);hold(d,130);return hold(d,175)}
d.reset();hold(d,175)
for(let i=0;i<3;i++) rep(d,75)
rep(d,100);s=rep(d,100);assert.equal(s.cue,'fading')
assert.equal(d.getStats().records.length,5)
const copy=d.getStats();copy.records.length=0;assert.equal(d.getStats().records.length,5)
d.reset();hold(d,175)
for(let i=0;i<3;i++) rep(d,90,25)
rep(d,90);s=rep(d,90);assert.equal(s.cue,'rushing')
d.reset();hold(d,175);hold(d,130);hold(d,175);s=rep(d,90);assert.equal(s.cue,'improved')
let stored=null
globalThis.localStorage={getItem:()=>stored,setItem:(_,value)=>{stored=value}}
const {readHistory,saveSession,review}=await import('./detector-test/history.js')
assert.deepEqual(readHistory(),[])
const session={id:'test',endedAt:Date.now(),durationMs:60000,...d.getStats()}
saveSession(session);assert.equal(readHistory()[0].repCount,session.repCount)
assert.equal(readHistory()[0].exercise,'squat','legacy sessions migrate to squat')
saveSession({...session,id:'push',exercise:'pushup'});assert.equal(readHistory().filter(s=>s.exercise==='pushup').length,1)
stored=JSON.stringify([session])
saveSession(session);assert.equal(readHistory().length,1)
assert.match(review(session),/幅度偏小/)
stored='invalid';assert.deepEqual(readHistory(),[])
localStorage.setItem=()=>{throw new Error('quota')}
assert.throws(()=>saveSession(session),/quota/)
console.log('PASS: range/tempo trends, correction, immutable stats, history persistence/deduplication/corruption/storage failure')
