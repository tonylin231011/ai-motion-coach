import { dayKey } from './activity'
import { duration, type Session } from './history'
import { EXERCISE_NAMES, isTimedExercise, type Exercise } from './types'
import { quality } from './workoutMetrics'
import type { RepRecord } from './coachDetector'

export function WeekStrip({history}:{history:Session[]}) {
  const now=new Date(),today=dayKey(now),monday=new Date(now);monday.setDate(now.getDate()-(now.getDay()+6)%7)
  const days=new Set(history.filter(s=>s.durationMs>0&&s.endedAt<=+now).map(s=>dayKey(new Date(s.endedAt))))
  return <div className="week-strip" aria-label="本周训练进度">{Array.from({length:7},(_,i)=>{const date=new Date(monday);date.setDate(monday.getDate()+i);const key=dayKey(date);return <div key={key} aria-label={`${key} ${key===today?'今天 ':''}${days.has(key)?'已训练':'未训练'}`}><i className={`${days.has(key)?'done':''} ${key===today?'today':''}`}/><span>{'一二三四五六日'[i]}</span></div>})}</div>
}
export function RecentExercises({history,onSelect,disabled}:{history:Session[];onSelect:(e:Exercise)=>void;disabled:boolean}) {
  const seen=new Set<Exercise>(),recent=history.slice().sort((a,b)=>b.endedAt-a.endedAt).filter(s=>{if(seen.has(s.exercise))return false;seen.add(s.exercise);return true}).slice(0,3)
  if(!recent.length)return null
  return <section className="continue-section"><h3>继续练</h3><div className="continue-grid">{recent.map(s=>{const q=quality([s]).percent;return <button key={s.id} disabled={disabled} onClick={()=>onSelect(s.exercise)}><span>{EXERCISE_NAMES[s.exercise]}</span><strong>{isTimedExercise(s.exercise)?duration(s.hold?.heldMs??0):s.exercise==='dumbbell_curl'?`${s.armCounts?.left??0} · ${s.armCounts?.right??0}`:`${s.repCount} 次`}</strong><small>{s.exercise==='dumbbell_curl'?'左 · 右 / ':''}{q===null?'标准率未评估':`标准率 ${q}%`}</small></button>})}</div></section>
}
export function QualityStrip({records,target,exercise}:{records:RepRecord[];target:number;exercise:Exercise}) {
  return <div className="quality-strip" aria-label="逐次动作质量">{Array.from({length:Math.max(target,records.length)},(_,i)=>{const r=records[i],state=!r?'pending':!r.valid&&exercise==='squat'?'miss':r.issue||!r.valid?'caution':'good';return <i key={i} className={state} title={`第 ${i+1} 次：${!r?'未完成':!r.valid&&exercise==='squat'?'未计':r.issue||!r.valid?'已计，有提示':'标准'}`}/>})}</div>
}
export function RepDetails({sessions}:{sessions:Session[]}) {
  return <details className="rep-details"><summary>逐次动作质量与关键角度</summary><p>角度来自原识别器记录；不是关节安全评分。未记录的角度不补造。</p>{sessions.map((s,g)=><div key={s.id}><h4>第 {g+1} 组</h4>{!s.records.length?<p>没有逐次动作明细；静态动作仅保留时长。</p>:<ol>{s.records.map((r,i)=><li key={i}><b>{i+1}{r.side?` · ${r.side==='left'?'左':'右'}`:''}</b><span>{!r.valid&&s.exercise==='squat'?'未计':r.issue||!r.valid?'已计，有提示':'标准'} · {r.issue==='shallow'?'幅度偏小':r.issue==='fast'?'节奏偏快':'无幅度／节奏提示'}</span><small>{s.exercise==='squat'?'膝角':s.exercise==='pushup'||s.exercise==='dumbbell_curl'?'肘角':'识别器角度'} {['squat','pushup','dumbbell_curl'].includes(s.exercise)&&Number.isFinite(r.minAngle)?`${Math.round(r.minAngle)}°`:'未记录'} · {(r.durationMs/1000).toFixed(1)} 秒</small></li>)}</ol>}</div>)}</details>
}
