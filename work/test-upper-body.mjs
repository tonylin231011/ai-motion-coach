import assert from 'node:assert/strict'
import {PushupDetector} from './detector-test/pushupDetector.js'
const point=(x,y)=>({x,y,z:0,visibility:.9})
const side=a=>{const r=a*Math.PI/180;return {left_shoulder:point(.5+Math.sin(r)*.2,.5+Math.cos(r)*.2),left_elbow:point(.5,.5),left_wrist:point(.5,.7)}}
const front=y=>({left_shoulder:point(.4,y),left_elbow:point(.4,(y+.75)/2),left_wrist:point(.4,.75),right_shoulder:point(.6,y),right_elbow:point(.6,(y+.75)/2),right_wrist:point(.6,.75)})
let time=1000
const hold=(d,frame,n=8)=>{let s;for(let i=0;i<n;i++)s=d.update(frame,time+=100);return s}
const d=new PushupDetector();hold(d,side(150));hold(d,side(110));let s=hold(d,side(150));assert.equal(s.repCount,1)
assert.equal(d.getStats().records.length,1)
const f=new PushupDetector();hold(f,front(.25));hold(f,front(.48));s=hold(f,front(.25));assert.equal(s.repCount,1,'shoulder-only signal with projected straight elbow')
hold(f,front(.48));s=hold(f,front(.25));assert.equal(s.repCount,2,'consecutive reps')
const shallow=new PushupDetector();hold(shallow,side(175));hold(shallow,side(150));s=hold(shallow,side(175));assert.equal(s.repCount,1,'shallow complete cycle counts');assert.equal(shallow.getStats().records[0].issue,'shallow')
const jitter=new PushupDetector();for(let i=0;i<100;i++) s=hold(jitter,front(.25+(i%2)*.01),1);assert.equal(s.repCount,0)
const incomplete=new PushupDetector();hold(incomplete,front(.25));s=hold(incomplete,front(.48),30);assert.equal(s.repCount,0)
const loss=new PushupDetector();hold(loss,front(.25));hold(loss,front(.48));loss.update({},time+=1000);s=hold(loss,front(.25));assert.equal(s.repCount,0,'long loss does not bridge reps')
const short=new PushupDetector();hold(short,front(.25));hold(short,front(.48));short.update({},time+=100);s=hold(short,front(.25));assert.equal(s.repCount,1)
const handMove=new PushupDetector();hold(handMove,front(.25));let moved=front(.48);moved.left_wrist.y=.95;moved.right_wrist.y=.95;s=hold(handMove,moved);assert.equal(s.repCount,0)
console.log('PASS: cropped side, frontal shoulder movement, consecutive reps, shallow counted separately, jitter, incomplete cycle, long/short occlusion and hand movement')
