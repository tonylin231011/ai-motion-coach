import assert from 'node:assert/strict'
import {PlankDetector} from './detector-test/plankDetector.js'
const p=(x,y)=>({x,y,z:0,visibility:.9})
const pose={left_shoulder:p(.2,.3),left_elbow:p(.2,.5),left_wrist:p(.35,.5),left_hip:p(.5,.35),left_knee:p(.7,.38),left_ankle:p(.9,.4)}
let t=1000
const hold=(d,l,n,dt=100)=>{let s;for(let i=0;i<n;i++)s=d.update(l,t+=dt);return s}
const d=new PlankDetector()
let s=hold(d,pose,200);assert.equal(s.hold.heldMs,19300);assert.equal(s.hold.bestMs,19300)
const before=s.hold.heldMs;s=hold(d,{},20);assert.equal(s.hold.heldMs,before);assert.equal(s.hold.breaks,1)
s=hold(d,pose,100);assert.equal(s.hold.heldMs,before+9300);assert.equal(s.hold.bestMs,19300)
const beforeGap=s.hold.heldMs;s=hold(d,pose,1,5000);assert.equal(s.hold.heldMs,beforeGap);assert.equal(s.hold.breaks,2)
const sag={...pose,left_hip:p(.5,.48),left_knee:p(.7,.44)}
const fresh=new PlankDetector();s=hold(fresh,sag,30);assert.ok(s.hold.heldMs>0);assert.equal(s.cue,'sag')
const pike={...pose,left_hip:p(.5,.15),left_knee:p(.7,.275)};const beforePike=s.hold.heldMs;s=hold(fresh,pike,30);assert.equal(s.cue,'pike');assert.ok(s.hold.heldMs>beforePike)
const upright={...pose,left_shoulder:p(.5,.1),left_elbow:p(.5,.25),left_wrist:p(.65,.25),left_hip:p(.5,.4),left_knee:p(.5,.6),left_ankle:p(.5,.9)};const beforeStanding=s.hold.heldMs;s=hold(fresh,upright,30);assert.equal(s.hold.heldMs,beforeStanding)
for(const [width,height] of [[640,480],[480,640]]) {
 const cropped={left_shoulder:pose.left_shoulder,left_elbow:pose.left_elbow,left_wrist:pose.left_wrist}
 const partial=new PlankDetector();for(let i=0;i<40;i++) s=partial.update(cropped,t+=100,width,height)
 assert.ok(s.hold.heldMs>3000,'cropped support works in portrait and landscape');assert.match(s.feedback,/腰腿未完整观察/)
 const beforeMissing=s.hold.heldMs; s=hold(partial,{left_shoulder:pose.left_shoulder},20);assert.equal(s.hold.heldMs,beforeMissing)
}
let saved='[]';globalThis.localStorage={getItem:()=>saved,setItem:(_,s)=>{saved=s}}
const {saveSession,readHistory,review}=await import('./detector-test/history.js')
const session={exercise:'plank',id:'plank',endedAt:Date.now(),durationMs:40000,...d.getStats()}
saveSession(session);assert.deepEqual(readHistory()[0].hold,session.hold);assert.match(review(session),/累计保持/)
d.reset();assert.equal(d.getStats().hold.heldMs,0)
console.log('PASS: timer, pause/resume, gap, optional form feedback without blocking, upright rejection, cropped portrait/landscape, missing arm, persistence and reset')
const manual=new PlankDetector('manual');manual.setRunning(true,1000)
for(let now=1250;now<=66000;now+=250) {manual.update({},now);manual.tick(now)}
assert.equal(manual.getStats().hold.heldMs,65000,'65 seconds survives complete pose loss')
assert.equal(manual.getStats().hold.bestMs,65000);assert.equal(manual.getStats().hold.breaks,0)
manual.setRunning(false,66000);manual.tick(70000);assert.equal(manual.getStats().hold.heldMs,65000)
manual.setRunning(true,71000);manual.tick(76000);manual.tick(75900);manual.tick(76000)
assert.equal(manual.getStats().hold.heldMs,70000,'stale frame timestamps do not double count')
assert.equal(manual.getStats().hold.breaks,1);assert.equal(manual.getStats().hold.bestMs,65000)
console.log('PASS: manual timer exact 65 seconds with pose loss, pause/resume, longest segment, stale frame timestamps')
const assisted=new PlankDetector('assisted')
hold(assisted,{},20);assert.equal(assisted.running,false)
hold(assisted,pose,5);assert.equal(assisted.running,false)
hold(assisted,{},1);hold(assisted,pose,5);assert.equal(assisted.running,false,'unstable preparation cannot trigger')
hold(assisted,pose,5);assert.equal(assisted.running,true)
const baseline=assisted.getStats().hold.heldMs
hold(assisted,{},30);assert.equal(assisted.running,true);assert.equal(assisted.getStats().hold.heldMs,baseline+3000)
assisted.setRunning(false,t);hold(assisted,pose,20);assert.equal(assisted.running,false,'explicit pause must not automatically restart')
assisted.reset();assert.equal(assisted.getStats().hold.heldMs,0);hold(assisted,pose,10);assert.equal(assisted.running,true)
console.log('PASS: assisted start, stable preparation, interruption tolerance, explicit pause respected and fresh-session rearm')
