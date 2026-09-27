import assert from 'node:assert/strict'
import {TwistDetector} from './detector-test/twistDetector.js'
import {dailyActivity,calendarDays,dayKey} from './detector-test/activity.js'
const p=(x,y)=>({x,y,z:0,visibility:.9})
const pose=x=>({left_shoulder:p(.4,.2),right_shoulder:p(.6,.2),left_hip:p(.45,.55),right_hip:p(.55,.55),left_wrist:p(x-.01,.45),right_wrist:p(x+.01,.45)})
let t=1000
const feed=(d,x,make=pose)=>d.update(make(x),t+=150)
const path=(d,xs,make=pose)=>{let s;for(const x of xs)s=feed(d,x,make);return s}
const d=new TwistDetector();path(d,[.5,.5]);let s=path(d,[.46,.42,.38,.34]);assert.equal(s.repCount,1,'first visible side counts once')
s=path(d,[.34,.34,.34,.34]);assert.equal(s.repCount,1,'holding same side cannot count')
s=path(d,[.4,.46,.52,.58,.64]);assert.equal(s.repCount,2,'opposite travel counts')
for(let i=0;i<180;i++)feed(d,.64+(i%3-1)*.008)
assert.equal(d.getStats().repCount,2,'stopping after repetitions must not produce extra counts')
path(d,[.57,.5,.43,.35]);s=path(d,[.42,.5,.58,.65]);assert.equal(s.repCount,4,'four alternating sides count four')
d.reset();path(d,[.5,.5,.34,.5,.5]);assert.equal(d.getStats().repCount,0,'one-frame jump is rejected')
d.reset();s=path(d,[.5,.5,.35,.35]);assert.equal(s.repCount,1,'large move and stable next frame count at low FPS')
d.reset();for(let i=0;i<100;i++)s=feed(d,.5+(i%2 ? .015:-.015));assert.equal(s.repCount,0,'stationary jitter cannot count')
d.reset();path(d,[.62,.62,.65,.68,.72,.68,.64,.6,.56]);assert.ok(d.getStats().repCount>=2,'travel entirely on one side still counts')
const partial=(x)=>{const q=pose(x);delete q.right_wrist;q.left_wrist.visibility=.35;return q}
d.reset();s=path(d,[.5,.5,.46,.42,.38,.34,.4,.46,.52,.58,.64],partial);assert.equal(s.repCount,2,'partly visible one wrist still counts')
assert.match(d.update({},t+=100).trackingReason,/未看到同一侧/)
const switched=side=>{const q=pose(.5);if(side)delete q.left_wrist;else delete q.right_wrist;return q}
d.reset();for(const side of [0,0,1,1,1,0,0,0])s=d.update(switched(side),t+=150);assert.equal(s.repCount,0,'one wrist disappearing at rest cannot invent reps')
const session=(id,date,ms,exercise='squat')=>({id,endedAt:new Date(date).getTime(),durationMs:ms,exercise,repCount:2,attemptCount:2,records:[]})
const rows=[session('1','2026-09-20T08:00:00',60000),session('2','2026-09-20T20:00:00',120000,'russian_twist'),session('3','2026-09-19T23:59:00',1000),session('4','2026-09-20T00:01:00',2000)]
const map=dailyActivity(rows);assert.equal(map.get('2026-09-20').durationMs,182000);assert.equal(map.get('2026-09-20').sessions.length,3)
const days=calendarDays(new Date(2026,8,20));assert.equal(days.length,112);assert.equal(days[0].getDay(),1);assert.equal(days[111].getDay(),0);assert.equal(new Set(days.map(dayKey)).size,112)
const previous=calendarDays(new Date(2026,8,20),-16);assert.ok(dayKey(previous[111])<dayKey(days[0]))
let saved='[]';globalThis.localStorage={getItem:()=>saved,setItem:(_,v)=>saved=v}
const {saveSession,readHistory}=await import('./detector-test/history.js');saveSession(rows[1]);assert.equal(readHistory()[0].exercise,'russian_twist')
assert.equal(readHistory()[0].repCount,4,'legacy pairs converted to sides')
saveSession({...rows[1],id:'new',twistCountUnit:'sides'});assert.equal(readHistory()[0].repCount,2)
assert.equal(readHistory()[1].repCount,4,'legacy conversion is idempotent')
console.log('PASS: twist pairs, repeated endpoint, occlusion, jitter, daily aggregation, local dates, calendar alignment/paging, new exercise persistence')
