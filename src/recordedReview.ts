import type {Session} from './history'
import type {WorkoutDraft} from './localWorkout'
import {isTimedExercise} from './types'
export type RecordObservation={title:string;position:string;evidence:string;meaning:string;action:string;source:'recorded-time'|'recorded-count'|'recorded-hold';magnitude:number}
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length
const seconds=(n:number)=>(n/1000).toFixed(1)
export function reviewRecordedData(draft:WorkoutDraft,past:Session[]){
 const timed=isTimedExercise(draft.exercise),observations:RecordObservation[]=[],groups=draft.sessions.map((s,i)=>{
  const cycles=s.records.map((r,j)=>({index:j+1,ms:r.durationMs})).filter(r=>Number.isFinite(r.ms)&&r.ms>0&&r.ms<=60000)
  const location=`第${i+1}组`,avg=cycles.length?mean(cycles.map(c=>c.ms)):null
  if(!timed&&cycles.length>=6){
   const baseline=mean(cycles.slice(0,3).map(c=>c.ms));let first=-1
   for(let j=3;j<=cycles.length-3;j++){const run=cycles.slice(j,j+3),changes=run.map(r=>(r.ms-baseline)/baseline);if(run.every((r,k)=>!k||r.index===run[k-1].index+1)&&(changes.every(d=>d>.15)||changes.every(d=>d<-.15))){first=j;break}}
   const end=cycles.slice(-3),last=mean(end.map(c=>c.ms)),change=(last-baseline)/baseline
   observations.push({title:Math.abs(change)>.15?'后段节奏变化':'记录内节奏对照',position:`${location}已记录第${end[0].index}–${end[2].index}次`,evidence:`${location}前3条周期记录平均${seconds(baseline)}秒，末3条（第${end[0].index}–${end[2].index}条）平均${seconds(last)}秒，用时${change>=0?'增加':'缩短'}${Math.round(Math.abs(change)*100)}%。${first>=0?`从已记录第${cycles[first].index}次起，连续3条记录均同向变化超过15%。`:''}`,meaning:'这是已记录往返周期的用时变化，不能据此判断疲劳、动作深度或动作是否标准。',action:`下次第${i+1}组先以开头平均${seconds(baseline)}秒作节奏对照；不必刻意追求更快。`,source:'recorded-time',magnitude:Math.abs(change)})
  }
  const prior=past[0]
  if(timed){const held=s.hold?.heldMs??0,best=s.hold?.bestMs??0;observations.push({title:'保持时长记录',position:location,evidence:`${location}累计${seconds(held)}秒，最长连续${seconds(best)}秒，记录中断${s.hold?.breaks??0}次。${prior?.hold?`上次同动作单组累计${seconds(prior.hold.heldMs)}秒，本组相差${seconds(held-prior.hold.heldMs)}秒。`:''}`,meaning:'连续计时与中断来自应用记录；不等于标准姿态保持时间，也不能判断中断原因。',action:`下次先以本次第${i+1}组${seconds(held)}秒作时长对照，姿态评分暂不参与加量。`,source:'recorded-hold',magnitude:0})}
  return {group:i+1,count:s.repCount,attempts:s.attemptCount,cycles,averageMs:avg,heldMs:s.hold?.heldMs??0}
 })
 if(!timed){for(let i=1;i<groups.length;i++){const a=groups[i-1],b=groups[i],difference=b.count-a.count;observations.push({title:'组间完成量对照',position:`第${a.group}组 → 第${b.group}组`,evidence:`第${a.group}组记录${a.count}次／尝试${a.attempts}次，第${b.group}组记录${b.count}次／尝试${b.attempts}次，完成数${difference>=0?'增加':'减少'}${Math.abs(difference)}次。`,meaning:'完成量变化可能受目标、主动结束或漏识别影响；不能直接判断体力下降。',action:`下次对照第${b.group}组的完成量；如目标不同，先按各自目标看记录。`,source:'recorded-count',magnitude:a.count?Math.abs(difference/a.count):0})}
 if(!observations.length&&groups.length){const g=groups[0];observations.push({title:'本组可用记录',position:`第${g.group}组`,evidence:`第${g.group}组记录${g.count}次／尝试${g.attempts}次，含${g.cycles.length}条有效用时记录${g.averageMs===null?'':`，平均${seconds(g.averageMs)}秒`}。`,meaning:g.cycles.length<6?'不足6条周期记录，不能比较本组前3次与末3次。':'本条只描述记录，不评价姿态。',action:'下次保留完整一组的周期记录后，再比较开头与结尾节奏。',source:'recorded-count',magnitude:0})}}
 return {groups,observations:observations.sort((a,b)=>b.magnitude-a.magnitude).slice(0,3)}
}
