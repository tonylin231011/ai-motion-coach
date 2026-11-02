import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return next(s+'.ts',c);throw e}}})
const {WorkoutFlow}=await import('../src/workoutFlow.ts')
const {poseFeedback,CueGate}=await import('../src/poseFeedback.ts')
const {quality,recommendation,historyOverview,deltaLabel}=await import('../src/workoutMetrics.ts')
const {readDraft,storeDraft,saveDraft}=await import('../src/localWorkout.ts')
const point=(x,y)=>({x,y,z:0,visibility:.95})
const pose=a=>{const r=a*Math.PI/180;return {left_shoulder:point(.5+Math.sin(r)*.2,.15),left_hip:point(.5+Math.sin(r)*.2,.5+Math.cos(r)*.2),left_knee:point(.5,.5),left_ankle:point(.5,.7)}}
const sample={phase:'STANDING',repCount:0,attemptCount:0,averageKneeAngle:170,hipDisplacement:0,confidence:.95,feedback:''}
function harness(exercise='squat',plan={sets:2,target:1,restSeconds:10},timerOnly=false){let t=1000,ids=0;const flow=new WorkoutFlow(exercise,plan,timerOnly,()=>Date.now(),()=>`group-${++ids}`);const hold=(a,n=6)=>{let v;for(let i=0;i<n;i++)v=flow.frame(pose(a),t+=100,1,1,120);return v};const tick=(n=1,dt=100)=>{let v;for(let i=0;i<n;i++)v=flow.tick(t+=dt);return v};return {flow,hold,tick,time:()=>t}}

test('stable posture gates 3-2-1; no warm-up reps leak into the first group',()=>{
 const h=harness();h.hold(175,25);assert.equal(h.flow.stage,'countdown');assert.equal(h.flow.view(h.time()).snapshot.repCount,0)
 for(let i=0;i<40&&h.flow.stage!=='active';i++)h.hold(175,1)
 assert.equal(h.flow.stage,'active');assert.equal(h.flow.view(h.time()).snapshot.repCount,0)
 h.hold(130);h.hold(90,8);h.hold(130);h.hold(175,8)
 assert.equal(h.flow.sessions[0].repCount,1,'first rep immediately after go keeps standing calibration')
})
test('two groups count independently, rest then auto-ready, final summary does not auto-save',()=>{
 const h=harness();h.hold(175,60);h.hold(130);h.hold(90,8);h.hold(130);h.hold(175,8)
 assert.equal(h.flow.stage,'rest');assert.equal(h.flow.sessions.length,1);assert.equal(h.flow.sessions[0].repCount,1)
 h.tick(105);assert.equal(h.flow.stage,'ready');h.hold(175,60);h.hold(130);h.hold(90,8);h.hold(130);h.hold(175,8)
 assert.equal(h.flow.stage,'summary');assert.equal(h.flow.sessions.length,2);assert.notEqual(h.flow.sessions[0].id,h.flow.sessions[1].id)
 h.flow.finish(h.time());assert.equal(h.flow.sessions.length,2)
})
test('pause discards partial cycles without discarding existing attempts or bridging movement',()=>{
 const h=harness('squat',{sets:3,target:10,restSeconds:10});h.hold(175,60);h.hold(130);h.hold(90,8)
 h.flow.pause(h.time());assert.equal(h.flow.stage,'paused');const attempts=h.flow.view(h.time()).snapshot.attemptCount;assert.ok(attempts>0)
 h.hold(175,20);assert.equal(h.flow.view(h.time()).snapshot.repCount,0);h.flow.resume();h.hold(175,60)
 assert.equal(h.flow.view(h.time()).snapshot.repCount,0);assert.equal(h.flow.view(h.time()).snapshot.attemptCount,attempts)
})
test('camera disappearance after 3 seconds and a suspended timer cannot inflate hold time',()=>{
 const h=harness('plank',{sets:2,target:60,restSeconds:10});h.flow.manualStart(h.time());h.tick(30)
 assert.equal(h.flow.stage,'active');for(let i=0;i<31;i++){h.tick();h.flow.frame({},h.time(),640,480,120)}
 assert.equal(h.flow.stage,'paused');const before=h.flow.view(h.time()).snapshot.hold.heldMs;h.tick(50);assert.equal(h.flow.view(h.time()).snapshot.hold.heldMs,before)
 const s=harness('wall_sit',{sets:1,target:60,restSeconds:10},true);s.flow.manualStart(s.time());s.tick(30);s.tick(5);const held=s.flow.view(s.time()).snapshot.hold.heldMs;s.tick(1,60000);assert.equal(s.flow.stage,'paused');assert.equal(s.flow.view(s.time()).snapshot.hold.heldMs,held)
})
test('manual wall timer preserves target, actual milliseconds, completed sets and pause boundaries',()=>{
 const h=harness('wall_sit',{sets:2,target:10,restSeconds:10},true);h.flow.manualStart(h.time());h.tick(30);h.tick(100)
 assert.equal(h.flow.stage,'rest');const s=h.flow.sessions[0];assert.equal(s.repCount,1);assert.equal(s.wallSit.currentMs,0);assert.equal(s.hold.heldMs,10000);assert.equal(s.wallSit.sets[0].heldMs,10000)
 assert.equal(s.hold.timerMode,'manual')
})
test('light, missing person, too close and cropped legs have distinct guidance; side view never asserts knee valgus',()=>{
 assert.equal(poseFeedback('squat',{},sample,1,1,10).key,'dark')
 assert.equal(poseFeedback('squat',{},sample,1,1,120).key,'no-person')
 const cropped={left_shoulder:point(.4,.2),left_elbow:point(.4,.35),left_wrist:point(.4,.5)}
 assert.equal(poseFeedback('squat',cropped,sample,1,1,120).key,'legs-cropped')
 assert.equal(poseFeedback('squat',{...pose(170),left_shoulder:point(.3,.05),left_hip:point(.3,.9)},sample,1,1,120).key,'near')
 assert.notEqual(poseFeedback('squat',pose(90),sample,1,1,120).key,'knees-in')
 const front={left_shoulder:point(.25,.15),right_shoulder:point(.75,.15),left_hip:point(.3,.4),right_hip:point(.7,.4),left_knee:point(.46,.55),right_knee:point(.54,.55),left_ankle:point(.25,.8),right_ankle:point(.75,.8)}
 assert.equal(poseFeedback('squat',front,sample,1,1,120).key,'knees-in')
})
test('feedback changes are stable for three seconds and transient changes do not flicker',()=>{
 const gate=new CueGate(),a={key:'a',text:'a',severity:'good',joints:[],bodyVisible:true,ready:true,depth:null},b={...a,key:'b'}
 assert.equal(gate.update(a,0).key,'a');assert.equal(gate.update(b,100).key,'a');assert.equal(gate.update(b,2999).key,'a');assert.equal(gate.update(b,3000).key,'b')
})
test('quality excludes unobserved and static records; recommendation retains raw counting units',()=>{
 const base={id:'test',exercise:'squat',endedAt:10,durationMs:5000,repCount:3,attemptCount:5,records:[{durationMs:2000,minAngle:90,valid:true,issue:null},{durationMs:800,minAngle:90,valid:true,issue:'fast'},{durationMs:2000,minAngle:130,valid:false,issue:'shallow'}]}
 assert.deepEqual(quality([base]),{observed:3,good:1,percent:33});assert.equal(quality([{...base,records:[]}]).percent,null)
 assert.equal(quality([{...base,exercise:'plank'}]).percent,null);assert.equal(recommendation([],'squat').target,10);assert.equal(recommendation([{...base,exercise:'russian_twist',repCount:23}],'russian_twist').target,23)
 assert.equal(deltaLabel(null,80),'暂无可比数据')
})
test('local draft survives interrupted save and retries keep stable session IDs',()=>{
 const map=new Map();globalThis.localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}
 const session={id:'stable',exercise:'squat',endedAt:1,durationMs:1000,repCount:0,attemptCount:0,records:[]}
 const draft={id:'draft',exercise:'squat',plan:{sets:1,target:10,restSeconds:45},sessions:[session],createdAt:1,replayIds:[],ruleCounts:{}}
 storeDraft(draft);assert.deepEqual(readDraft(),draft);saveDraft(draft);saveDraft(draft);assert.equal(JSON.parse(map.get('motion-coach.sessions.v1')).length,1);assert.equal(readDraft(),null)
})
test('calendar streak and weekly goal count local days, not sets; seven-day mean is weighted',()=>{
 const now=new Date(2026,10,2,20),session=day=>({id:`s-${day}`,exercise:'squat',endedAt:+new Date(2026,10,day,12),durationMs:1000,repCount:1,attemptCount:1,records:[{valid:true,issue:null,durationMs:2000,minAngle:90}]})
 const o=historyOverview([session(2),session(2),session(1)],now,3);assert.equal(o.streak,2);assert.equal(o.weekDays,1);assert.equal(o.recentQuality.percent,100)
})
