import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { WallSitDetector } from '../src/wallSitDetector.ts'

registerHooks({resolve(specifier,context,next) {
  try { return next(specifier,context) }
  catch(error) {
    if(error.code==='ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(`${specifier}.ts`,context)
    throw error
  }
}})
const {readHistory,saveSession,review}=await import('../src/history.ts')
const {buildHistoryExport}=await import('../src/historyExport.ts')
const {dailyActivity,dayKey}=await import('../src/activity.ts')
const point=(x,y)=>({x,y,z:0,visibility:.9})
const sitting={left_shoulder:point(.3,.15),left_hip:point(.3,.45),left_knee:point(.6,.45),left_ankle:point(.6,.85)}

test('one continuous hold counts once at the exact target, even over multiple target periods',()=>{
  const d=new WallSitDetector('manual',20000)
  d.setRunning(true,0)
  d.tick(19999);assert.equal(d.getStats().repCount,0)
  d.tick(20000);assert.equal(d.getStats().repCount,1)
  d.tick(65000);assert.equal(d.getStats().repCount,1)
  assert.equal(d.getStats().hold.bestMs,65000)
  d.finish(65000);d.finish(99999)
  assert.deepEqual(d.getStats().wallSit.sets,[{heldMs:65000,completed:true}])
  assert.equal(d.getStats().hold.breaks,0)
})

test('separate short attempts never combine into a completed set; pauses exclude rest time',()=>{
  const d=new WallSitDetector('manual',20000)
  d.setRunning(true,1000);d.setRunning(false,13000)
  d.tick(100000);assert.equal(d.getStats().hold.heldMs,12000)
  d.setRunning(true,100000);d.setRunning(false,109000)
  d.setRunning(true,200000);d.finish(220000)
  const stats=d.getStats()
  assert.equal(stats.repCount,1);assert.equal(stats.attemptCount,3)
  assert.equal(stats.hold.heldMs,41000);assert.equal(stats.hold.bestMs,20000)
  assert.equal(stats.hold.breaks,2)
  assert.deepEqual(stats.wallSit.sets,[{heldMs:12000,completed:false},{heldMs:9000,completed:false},{heldMs:20000,completed:true}])
})

test('assisted starts only after stable side-view posture; long frame gaps reset confirmation',()=>{
  const d=new WallSitDetector()
  d.update(sitting,0,640,480);d.update(sitting,400,640,480)
  assert.equal(d.running,false)
  d.update(sitting,2000,640,480);assert.equal(d.running,false)
  for(let t=2100;t<=2900;t+=100) d.update(sitting,t,640,480)
  assert.equal(d.running,true);assert.equal(d.getStats().hold.heldMs,0)
  d.update({},3900,640,480)
  assert.equal(d.getStats().hold.heldMs,1000) // explicit timer, not certified posture
  d.setRunning(false,4000)
  for(let t=4100;t<=6000;t+=100) d.update(sitting,t,640,480)
  assert.equal(d.running,false);assert.equal(d.getStats().hold.heldMs,1100)
})

test('manual does not auto-start; standing, invalid points and tiny/degenerate limbs do not auto-start',()=>{
  const manual=new WallSitDetector('manual')
  const standing={...sitting,left_knee:point(.3,.65),left_ankle:point(.3,.9)}
  const invalid={...sitting,left_ankle:point(NaN,.85)}
  const tiny={left_shoulder:point(.3,.15),left_hip:point(.3,.45),left_knee:point(.31,.45),left_ankle:point(.31,.46)}
  for(const pose of [standing,invalid,tiny,{}]) {
    const d=new WallSitDetector()
    for(let t=0;t<=2000;t+=100) d.update(pose,t,640,480)
    assert.equal(d.running,false)
  }
  for(let t=0;t<=2000;t+=100) manual.update(sitting,t,640,480)
  assert.equal(manual.running,false)
  manual.setRunning(true,2000);manual.update({},4000)
  assert.equal(manual.getStats().hold.heldMs,2000)
})

test('shallow comfortable hold and either visible side can start; screen aspect is respected',()=>{
  for(const [width,height] of [[640,480],[480,640]]) {
    const pose={left_shoulder:point(.2,.1),left_hip:point(.2,.35),left_knee:point(.2+120/width,.5),left_ankle:point(.2+120/width,.85)}
    const d=new WallSitDetector()
    for(let t=0;t<=800;t+=100) d.update(pose,t,width,height)
    assert.equal(d.running,true)
    const right=Object.fromEntries(Object.entries(pose).map(([key,p])=>[key.replace('left','right'),{...p,x:1-p.x}]))
    const other=new WallSitDetector()
    for(let t=0;t<=800;t+=100) other.update(right,t,width,height)
    assert.equal(other.running,true)
  }
})

test('background-style pause cannot resume automatically; duplicate timestamps and start actions cannot inflate time',()=>{
  const d=new WallSitDetector('assisted',10000)
  d.setRunning(true,1000);d.setRunning(true,1000)
  d.tick(6000);d.tick(6000);d.tick(5000)
  assert.equal(d.getStats().hold.heldMs,5000)
  d.setRunning(false,6000);d.tick(999999)
  for(let t=1000000;t<=1001000;t+=100) d.update(sitting,t)
  assert.equal(d.running,false);assert.equal(d.getStats().repCount,0)
  const snapshot=d.getStats();snapshot.wallSit.sets[0].heldMs=999
  assert.equal(d.getStats().wallSit.sets[0].heldMs,5000)
  d.reset();assert.equal(d.running,false);assert.equal(d.getStats().attemptCount,0)
  assert.throws(()=>new WallSitDetector('manual',NaN))
})

test('wall sit history, export and daily activity retain milliseconds and set units alongside legacy sessions',()=>{
  const d=new WallSitDetector('manual',10000)
  d.setRunning(true,0);d.setRunning(false,12500);d.setRunning(true,20000);d.finish(23000)
  const session={exercise:'wall_sit',countMode:'completed',id:'wall-test',endedAt:Date.now(),durationMs:23000,...d.getStats()}
  const old={id:'old-squat',endedAt:session.endedAt,durationMs:8000,repCount:1,attemptCount:1,records:[]}
  const plank={...old,id:'old-plank',exercise:'plank',repCount:0,hold:{heldMs:15000,bestMs:15000,breaks:0}}
  let storage=JSON.stringify([old,plank])
  globalThis.localStorage={getItem:()=>storage,setItem:(_,value)=>{storage=value}}
  try {
    saveSession(session);saveSession(session)
    assert.equal(readHistory().length,3)
    assert.deepEqual(readHistory()[0],session)
    assert.equal(readHistory()[1].exercise,'squat');assert.equal(readHistory()[2].hold.heldMs,15000)
    const exported=buildHistoryExport(readHistory())
    assert.deepEqual(exported.sessions[0].wallSit,session.wallSit)
    assert.equal(exported.sessions[0].hold.heldMs,15500)
    assert.equal(dailyActivity(readHistory()).get(dayKey(new Date(session.endedAt))).sessions.length,3)
    assert.match(review(session),/完成 1 组，尝试 2 组/)
    for(const broken of [
      {...session,repCount:2}, {...session,hold:{...session.hold,heldMs:20000}},
      {...session,wallSit:{...session.wallSit,targetMs:-1}},
      {...session,wallSit:{...session.wallSit,sets:[{heldMs:2000,completed:true}]}},
      {...session,wallSit:undefined},
    ]) {
      storage=JSON.stringify([broken,old,plank])
      assert.equal(readHistory().length,2)
    }
  } finally {delete globalThis.localStorage}
})
