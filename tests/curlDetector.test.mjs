import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CurlDetector } from '../src/curlDetector.ts'

const point = (x,y) => ({x,y,z:0,visibility:.95})
function pose(left, right, width=640, height=480, offset=0) {
  const landmarks = {}
  for (const [side, degrees, x] of [['left',left,.35],['right',right,.65]]) {
    if (degrees == null) continue
    const radians=degrees*Math.PI/180
    landmarks[`${side}_shoulder`]=point(x+offset,.25)
    landmarks[`${side}_elbow`]=point(x+offset,.45)
    landmarks[`${side}_wrist`]=point(x+offset+Math.sin(radians)*.18*height/width,.45-Math.cos(radians)*.18)
  }
  return landmarks
}
function harness(width=640,height=480) {
  const d=new CurlDetector(); let time=0
  const hold=(left,right,n=5,dt=100) => {
    let result
    for(let i=0;i<n;i++) result=d.update(pose(left,right,width,height),time+=dt,width,height)
    return result
  }
  return {d,hold,frame:(p,dt=100)=>d.update(p,time+=dt,width,height)}
}
test('simultaneous arms count independently and snapshots do not leak mutable stats',()=>{
  const {d,hold}=harness(); hold(175,175); hold(80,80); const s=hold(175,175)
  assert.deepEqual(s.armCounts,{left:1,right:1}); assert.equal(s.repCount,2)
  assert.equal(s.attemptCount,2); assert.deepEqual(d.getStats().records.map(r=>r.side),['left','right'])
  s.armCounts.left=999; const stats=d.getStats(); stats.records[0].side='right'
  assert.deepEqual(d.getStats().armCounts,{left:1,right:1}); assert.equal(d.getStats().records[0].side,'left')
})
test('alternating arms and a cropped single arm work without hip or leg landmarks',()=>{
  const {d,hold}=harness(); hold(175,175)
  for(let i=0;i<3;i++) { hold(75,175);hold(175,175);hold(175,85);hold(175,175) }
  assert.deepEqual(d.getStats().armCounts,{left:3,right:3})
  const single=harness(); single.hold(null,175);single.hold(null,80)
  const s=single.hold(null,175);assert.deepEqual(s.armCounts,{left:0,right:1})
  assert.match(s.trackingReason,/仅看清右手/)
})
test('holds, noise, straight arm raising and incomplete cycles never count',()=>{
  const {d,hold}=harness();hold(80,80,10);assert.equal(d.getStats().repCount,0)
  hold(175,175);hold(140,140);hold(175,175);assert.equal(d.getStats().repCount,0)
  for(let i=0;i<100;i++) hold(170+(i%2)*5,172+(i%2)*3,1)
  hold(75,75,20);assert.equal(d.getStats().repCount,0)
  // The shoulder/elbow/wrist angle is translation invariant.
  const moving=harness()
  for(let i=0;i<50;i++) moving.frame(pose(175,175,640,480,(i%2)*.04))
  assert.equal(moving.d.getStats().repCount,0)
})
test('a spike cannot create a rep; stopping after a real rep does not drift',()=>{
  const {d,hold}=harness();hold(175,175);hold(70,70,1);hold(175,175)
  assert.equal(d.getStats().repCount,0)
  hold(80,80);hold(175,175);hold(175,175,180)
  assert.equal(d.getStats().repCount,2)
})
test('occlusion and stalled inference cannot join different partial cycles',()=>{
  const {d,hold,frame}=harness();hold(175,175);hold(80,80);frame({},800);hold(175,175)
  assert.equal(d.getStats().repCount,0)
  hold(80,80);hold(175,175,5,1000);assert.equal(d.getStats().repCount,0)
  const single=harness();single.hold(175,null);single.hold(80,null)
  single.hold(null,175);single.hold(null,80);single.hold(175,null)
  assert.equal(single.d.getStats().repCount,0)
})
test('a brief wrist occlusion preserves a confirmed cycle without inventing the missing side',()=>{
  const {d,hold,frame}=harness();hold(175,null);hold(80,null);frame({})
  hold(175,null);assert.deepEqual(d.getStats().armCounts,{left:1,right:0})
})
test('continuous trajectories need no pause at the top and low frame rates still count',()=>{
  for(const dt of [90,200,350]) {
    const {d,hold}=harness()
    for(const a of [175,175,175,175,150,130,110,90,80,90,110,140,160,175,175,175]) hold(a,null,1,dt)
    assert.equal(d.getStats().repCount,1,`continuous cycle at ${dt}ms/frame`)
  }
})
test('fast observed cycles are counted and flagged rather than silently thrown away',()=>{
  const {d,hold}=harness();hold(175,null);hold(80,null);hold(175,null)
  assert.equal(d.getStats().repCount,1);assert.equal(d.getStats().records[0].issue,'fast')
})
test('low confidence, invalid coordinates and duplicate times cannot advance counts',()=>{
  const d=new CurlDetector();const p=pose(175,175)
  for(let i=0;i<20;i++) d.update(p,0,640,480)
  assert.equal(d.getStats().attemptCount,0)
  const bad=pose(175,175);bad.left_wrist.visibility=.2;bad.right_elbow.x=NaN
  assert.equal(d.update(bad,100,640,480).confidence,0)
  assert.equal(d.update(p,200,0,480).confidence,0)
  assert.equal(d.update({},NaN).repCount,0)
})
test('orientation/aspect ratio and partial extension remain usable',()=>{
  for(const [width,height] of [[640,480],[480,640],[1920,1080]]) {
    const {d,hold}=harness(width,height);hold(155,160);hold(85,85);hold(155,160)
    assert.deepEqual(d.getStats().armCounts,{left:1,right:1})
  }
})
test('moderately shallow completed cycles count with a correction, and reset clears everything',()=>{
  const {d,hold}=harness();hold(175,null);hold(112,null);hold(175,null)
  assert.equal(d.getStats().repCount,1);assert.equal(d.getStats().records[0].issue,'shallow')
  d.reset();assert.deepEqual(d.getStats(),{repCount:0,attemptCount:0,records:[],armCounts:{left:0,right:0}})
})
