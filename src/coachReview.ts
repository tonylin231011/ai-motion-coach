import {reviewRecordedData} from './recordedReview'
import type { Session } from './history'
import type { WorkoutDraft } from './localWorkout'
import {isTimedExercise} from './types'
import {reviewRules as rules,reviewCopy} from './reviewRules'
export type ReviewMetric={name:string;value:number;unit:string;group:number;rep?:number;second?:number;observability:number;coverage:number;baseline?:number;lowerIsWorse?:boolean;severity?:number;priority?:'form'|'efficiency'}
export type Finding={metric:string;severity:number;persistence:number;position:string;evidence:string;observability:number;baseline:number;score:number;cause:string;cue:string;adjustment:string}
export type CheckIn={rpe?:number;discomfort?:'none'|'mild'|'stop'}
const position=(m:ReviewMetric)=>m.rep!==undefined?`第${m.group}组第${m.rep}次`:`第${m.group}组第${m.second??0}秒`
const trusted=(m:ReviewMetric)=>Number.isFinite(m.value)&&Number.isFinite(m.observability)&&m.observability>=rules.minObservable&&m.observability<=1&&Number.isFinite(m.coverage)&&m.coverage>=0&&m.coverage<=1&&Number.isInteger(m.group)&&m.group>0&&(Number.isInteger(m.rep)&&m.rep!>0||Number.isFinite(m.second)&&m.second!>=0)
export function buildReview(draft:WorkoutDraft,history:Session[],metrics:ReviewMetric[]=[],checkIn:CheckIn={}){
 const timed=isTimedExercise(draft.exercise),sessions=draft.sessions,held=sessions.reduce((n,s)=>n+(s.hold?.heldMs??0),0),total=sessions.reduce((n,s)=>n+s.repCount,0),attempts=sessions.reduce((n,s)=>n+s.attemptCount,0)
 const ownIds=new Set(sessions.map(s=>s.id)),past=history.filter(s=>s.exercise===draft.exercise&&!ownIds.has(s.id)&&s.endedAt<draft.createdAt).sort((a,b)=>b.endedAt-a.endedAt),amount=(s:Session)=>timed?Math.round((s.hold?.heldMs??0)/1000):s.repCount
 const accepted=metrics.filter(trusted),unknown=new Set(['分段下降/上升时长与底部停顿','实测组间休息','左右对称差','姿态标准率','疲劳衰减','膝/髋/躯干姿态：缺少可信视角与可观测度'])
 for(const m of metrics)if(!trusted(m))unknown.add(`${m.name}：可观测度不足或证据位置缺失`)
 const findings:Finding[]=[]
 for(const name of ['depth','tempo'] as const){
 const rows=accepted.filter(m=>m.name===name&&m.rep!==undefined).sort((a,b)=>a.group-b.group||a.rep!-b.rep!)
 // Individual baseline is the first three observable reps in the same set; no cross-set fatigue stitching.
 const groups=[...new Set(rows.map(m=>m.group))],candidates:{m:ReviewMetric;base:number;drop:number}[]=[]
 for(const group of groups){const list=rows.filter(m=>m.group===group);if(list.length<6||list.slice(0,3).some((m,i)=>m.rep!==i+1))continue;const base=list.slice(0,3).reduce((n,m)=>n+m.value,0)/3;if(base<=0)continue
 for(let i=3;i<=list.length-rules.fatigueRun;i++){const run=list.slice(i,i+rules.fatigueRun);if(run.some((m,j)=>j>0&&m.rep!==run[j-1].rep!+1))continue;const drop=(m:ReviewMetric)=>m.lowerIsWorse===false?(m.value-base)/base:(base-m.value)/base;if(run.every(m=>drop(m)>rules.fatigueDrop)){candidates.push({m:run[0],base,drop:drop(run[0])});break}}
 }
 if(candidates.length){const c=candidates[0],copy=reviewCopy[name],severity=Math.min(3,1+c.drop*3),obs=Math.min(...candidates.map(c=>c.m.observability));findings.push({metric:copy.title,severity,persistence:candidates.length,position:position(c.m),evidence:`${position(c.m)}起连续3次变化超过15%；首次为${c.m.value.toFixed(2)}${c.m.unit}，本组前3次均值${c.base.toFixed(2)}${c.m.unit}，变化${Math.round(c.drop*100)}%`,observability:obs,baseline:c.base,score:severity*candidates.length*obs,cause:copy.causes[0],cue:copy.cues[(c.m.group-1)%copy.cues.length],adjustment:`下一组先试${Math.max(1,draft.plan.target-2)}次，与第${c.m.group}组前3次对照`})}
 }
 const reliableRate=accepted.filter(m=>m.name==='standardRate'&&m.value>=0&&m.value<=1),rate=reliableRate.length===sessions.length&&sessions.every((_,i)=>reliableRate.filter(m=>m.group===i+1).length===1)?reliableRate.reduce((n,m)=>n+m.value,0)/reliableRate.length:null
 if(rate!==null)unknown.delete('姿态标准率')
 let target=draft.plan.target,reason='缺少可信姿态标准率或疲劳指标，暂不自动增加训练量。'
 if(checkIn.discomfort==='stop'){target=Math.max(timed?5:1,Math.floor(target*.5));reason='你选择了“需要停止”：本次到此结束，先休息；下次仅保留降量参考，不自动启动。'}
 else if(checkIn.discomfort==='mild'||(checkIn.rpe??0)>=9){target=Math.max(timed?5:1,Math.floor(target*.8));reason=`你报告${checkIn.discomfort==='mild'?'轻微不适':`用力程度${checkIn.rpe}/10`}，下次参考量下调20%。`}
 else if(rate!==null){if(timed&&rate>=rules.highRate){target+=Math.max(rules.minTimedIncrease,Math.ceil(target*rules.timedIncrease));reason=`可评估组平均标准率${Math.round(rate*100)}%，时长增加10%（至少5秒）。`}else if(!timed&&rate>=rules.highRate&&accepted.some(m=>m.name==='fatigueDrop'&&m.value<=rules.fatigueDrop)){target++;reason=`可评估组平均标准率${Math.round(rate*100)}%，已测疲劳衰减不超过15%，增加1次。`}else if(rate<rules.keepRate){target=Math.max(timed?5:1,Math.floor(target*.8));reason=`可评估组平均标准率${Math.round(rate*100)}%，低于80%，参考量下调20%。`}else reason=`可评估组平均标准率${Math.round(rate*100)}%，维持原目标。`}
 target=Math.min(draft.exercise==='wall_sit'?120:timed?600:200,target)
 const recorded=reviewRecordedData(draft,past)
 return {recorded,rate,findings:findings.sort((a,b)=>b.score-a.score).slice(0,3),unknown:[...unknown],headline:`第1–${sessions.length}组记录${timed?`${Math.round(held/1000)}秒`:`${total}次／尝试${attempts}次`}；${rate===null?'姿态可信度未记录，本次只复盘计数/计时':`可评估组平均标准率${Math.round(rate*100)}%`}`,current:timed?Math.round(held/1000):total,previous:past[0]?amount(past[0]):null,best:past.length?Math.max(...past.map(amount)):null,trend:past.slice(0,4).reverse().map(s=>({id:s.id,value:amount(s),at:s.endedAt})),strengths:sessions.map((s,i)=>`第${i+1}组${timed?`记录保持${Math.round((s.hold?.heldMs??0)/1000)}秒，最长连续${Math.round((s.hold?.bestMs??0)/1000)}秒`:`记录${s.repCount}次／尝试${s.attemptCount}次`}。`).slice(0,2),prescription:{sets:draft.plan.sets,target,restSeconds:draft.plan.restSeconds,reason}}
}
