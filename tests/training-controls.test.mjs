import assert from 'node:assert/strict'
import {test} from 'node:test'
import {registerHooks} from 'node:module'
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return next(s+'.ts',c);throw e}}})
const {digits,validateNumber,planRules,persistPlan,loadPlan,ConfirmationClock}=await import('../src/trainingControls.ts')
const {WorkoutFlow}=await import('../src/workoutFlow.ts')
const {saveDraft}=await import('../src/localWorkout.ts')
const storage=()=>{const map=new Map();globalThis.localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};return map}
test('numeric drafts allow empty and intermediate input; validation restores or bounds only on commit',()=>{
 const r=planRules('squat').target
 assert.equal(digits(''),'');assert.equal(digits('1'),'1');assert.equal(digits('15'),'15');assert.equal(digits('x7.abc'),'7')
 assert.deepEqual(validateNumber('',12,r),{value:12,message:'请输入有效数字'})
 assert.deepEqual(validateNumber('0',12,r),{value:12,message:'请输入有效数字'})
 assert.deepEqual(validateNumber('999',12,r),{value:200,message:'最多 200'})
 assert.equal(validateNumber('7',12,r).value,7)
 assert.equal(planRules('plank').target.max,600);assert.equal(planRules('wall_sit').target.max,120)
})
test('plans persist per exercise; only-today overrides expire without replacing defaults',()=>{
 storage();const fallback={sets:3,target:10,restSeconds:45},defaults={sets:20,target:200,restSeconds:600},today={sets:2,target:7,restSeconds:30},date=new Date(2026,10,3)
 persistPlan('squat',defaults,'default',date);persistPlan('squat',today,'today',date)
 assert.deepEqual(loadPlan('squat',fallback,date),today)
 assert.deepEqual(loadPlan('squat',fallback,new Date(2026,10,4)),defaults)
 assert.deepEqual(loadPlan('pushup',fallback,date),fallback)
 persistPlan('squat',defaults,'default',date);assert.deepEqual(loadPlan('squat',fallback,date),defaults)
 assert.throws(()=>persistPlan('wall_sit',{...fallback,target:600},'default',date))
})
test('confirmation freeze excludes dialog time and continues the same timed set without splitting or inflating it',()=>{
 const clock=new ConfirmationClock(),flow=new WorkoutFlow('wall_sit',{sets:2,target:10,restSeconds:10},true);let real=1000
 const tick=()=>flow.tick(clock.now(real+=100));flow.manualStart(clock.now(real));for(let i=0;i<50;i++)tick()
 const before=flow.view(clock.now(real)).snapshot.hold.heldMs;clock.pause(real);real+=6000
 assert.equal(clock.now(real),real-6000);assert.equal(flow.view(clock.now(real)).snapshot.hold.heldMs,before)
 clock.resume(real);for(let i=0;i<80;i++)tick()
 assert.equal(flow.sessions.length,1);assert.equal(flow.sessions[0].wallSit.sets.length,1);assert.equal(flow.sessions[0].hold.heldMs,10000)
})
test('confirming finish uses the frozen time and repeat save keeps one record',()=>{
 storage();const clock=new ConfirmationClock(),flow=new WorkoutFlow('wall_sit',{sets:1,target:90,restSeconds:45},true,()=>1,()=> 'same-id');let real=1000
 flow.manualStart(clock.now(real));for(let i=0;i<50;i++)flow.tick(clock.now(real+=100))
 const held=flow.view(clock.now(real)).snapshot.hold.heldMs;clock.pause(real);real+=9000;flow.finish(clock.now(real));flow.finish(clock.now(real))
 assert.equal(flow.sessions.length,1);assert.equal(flow.sessions[0].hold.heldMs,held)
 const draft={id:'draft',exercise:'wall_sit',plan:flow.plan,sessions:flow.sessions,replayIds:[],ruleCounts:{},createdAt:1};saveDraft(draft);saveDraft(draft)
 assert.equal(JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length,1)
})
test('rest and countdown do not silently expire while finish confirmation is open',()=>{
 const clock=new ConfirmationClock(),flow=new WorkoutFlow('wall_sit',{sets:2,target:5,restSeconds:10},true);let real=1000
 flow.manualStart(real);flow.tick(real+=1000);const remaining=flow.view(real).countdown;clock.pause(real);real+=9000;clock.resume(real)
 assert.equal(flow.tick(clock.now(real)).countdown,remaining)
 for(let i=0;i<70;i++)flow.tick(clock.now(real+=100));assert.equal(flow.stage,'rest')
 const rest=flow.view(clock.now(real)).remainingRest;clock.pause(real);real+=20000;clock.resume(real)
 assert.equal(flow.tick(clock.now(real)).remainingRest,rest)
})
