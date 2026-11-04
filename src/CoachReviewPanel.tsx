import {useMemo,useState} from 'react'
import {buildReview,type CheckIn} from './coachReview'
import type {WorkoutDraft} from './localWorkout'
import type {Session} from './history'
import {isTimedExercise} from './types'
import {persistPlan} from './trainingControls'
export function CoachReviewPanel({draft,history,onPlan}:{draft:WorkoutDraft;history:Session[];onPlan?:()=>void}){
 const [check,setCheck]=useState<CheckIn>(()=>{try{return JSON.parse(localStorage.getItem(`motion-coach.check-in.v1:${draft.id}`)||'{}')}catch{return {}}}),[status,setStatus]=useState('')
 const review=useMemo(()=>buildReview(draft,history,[],check),[draft,history,check]),timed=isTimedExercise(draft.exercise)
 const update=(next:CheckIn)=>{setCheck(next);try{localStorage.setItem(`motion-coach.check-in.v1:${draft.id}`,JSON.stringify(next));setStatus('感受已保存在当前浏览器，尚不随云端同步')}catch{setStatus('感受未保存，请保持此页重试')}}
 return <div className="coach-review"><section className="summary-score"><p>教练复盘 · 证据不足时降级</p><strong>{review.rate===null?'—':Math.round(review.rate*100)}<small>{review.rate===null?'无可信姿态评分':'%'}</small></strong><p>{review.headline}</p></section>
 <section className="summary-totals">{[['本次（整次）',review.current],['上次（单组）',review.previous],['历史最佳（单组）',review.best]].map(([label,value])=><div key={String(label)}><strong>{value??'—'}</strong><span>{label} · {timed?'秒':'次'}</span></div>)}</section>
 <section className="summary-sets"><h3>分组记录</h3>{draft.sessions.map((s,i)=><p key={s.id}>第{i+1}组：{timed?`${Math.round((s.hold?.heldMs??0)/1000)}秒`:`${s.repCount}次／尝试${s.attemptCount}次`}。疲劳点：缺少可信逐次指标。</p>)}</section>
 {review.findings.map((f,i)=><details className="review-finding" key={f.metric} open={i===0}><summary>{f.metric} · {f.observability>=.8?'高':'中'}可信度</summary><p>{f.evidence}</p><p>{f.cause}</p><p>口令：{f.cue}</p><p>{f.adjustment}</p></details>)}
 <section className="improvement"><h3>已记录的完成量</h3>{review.strengths.map(s=><p key={s}>{s}</p>)}<p>进步与稳定性：缺少同一整次训练的可比可信指标，暂不下结论。</p></section>
 <section className="review-checkin"><h3>训练感受（可跳过）</h3><label>自觉用力程度<select aria-label="自觉用力程度" value={check.rpe??''} onChange={e=>update({...check,rpe:e.target.value?Number(e.target.value):undefined})}><option value="">跳过</option>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}/10</option>)}</select></label><label>有无不适<select aria-label="有无不适" value={check.discomfort??''} onChange={e=>update({...check,discomfort:e.target.value as CheckIn['discomfort']||undefined})}><option value="">跳过</option><option value="none">无</option><option value="mild">轻微</option><option value="stop">需要停止</option></select></label><p role="status">{status}</p></section>
 <section className="review-prescription"><h3>下次参考计划</h3><p>{review.prescription.sets}组 × {review.prescription.target}{timed?'秒':'次'} · 休息{review.prescription.restSeconds}秒</p><p>{review.prescription.reason}</p><p>重点口令：缺少可信发现，本次不生成姿态口令。</p><button onClick={()=>{try{persistPlan(draft.exercise,review.prescription,'today');onPlan?.();setStatus('已加入今日建议（当前浏览器）')}catch{setStatus('未能加入今日建议，请重试')}}}>加入今日建议</button></section>
 <details className="summary-sets"><summary>本次无法判断</summary>{review.unknown.map(s=><p key={s}>{s}</p>)}<p>旧姿态统计没有逐指标可观测度，本次不作为结论证据。</p></details>
 <section className="summary-sets"><h3>最近4组历史记录 · {timed?'保持秒数':'完成次数'}</h3>{review.trend.length?review.trend.map(s=><div key={s.id}><span>{new Date(s.at).toLocaleDateString()}</span><progress max={Math.max(1,...review.trend.map(p=>p.value))} value={s.value}/><b>{s.value}</b></div>):<p>0条可比历史记录，暂不画趋势。</p>}</section>
 <p className="history-note">仅复盘可观测数据；如有不适，请停止当前训练并休息。这里不提供伤病诊断。</p></div>
}
