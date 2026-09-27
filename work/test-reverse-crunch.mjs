import assert from 'node:assert/strict'
import {ReverseCrunchDetector} from './detector-test/reverseCrunchDetector.js'
const p=(x,y,v=.9)=>({x,y,z:0,visibility:v})
const pose=x=>({left_shoulder:p(.2,.5),left_hip:p(.45,.5),left_knee:p(x,.5)})
let t=1000
const hold=(detector,x,n=3)=>{let result;for(let i=0;i<n;i++)result=detector.update(pose(x),t+=200,640,480);return result}
const detector=new ReverseCrunchDetector()
let s=hold(detector,.8);assert.equal(s.repCount,0)
s=hold(detector,.5);assert.equal(s.attemptCount,1);assert.equal(s.repCount,0)
s=hold(detector,.8);assert.equal(s.repCount,1)
s=hold(detector,.8);assert.equal(s.repCount,1,'held extension not double counted')
hold(detector,.5);s=hold(detector,.8);assert.equal(s.repCount,2)
detector.reset();s=hold(detector,.5);assert.equal(s.repCount,0,'tucked pose without extension does not count')
detector.reset();hold(detector,.8);s=hold(detector,.5);assert.equal(s.repCount,0,'tuck without return does not complete')
console.log('PASS: reverse crunch extension, tuck, return, held pose, reset and incomplete motion')
