import { memo, useMemo, useState } from 'react'
import { calendarDays, dailyActivity, dayKey } from './activity'
import { duration, type Session } from './history'
import { EXERCISE_NAMES } from './types'
export const ActivityHeatmap=memo(function ActivityHeatmap({sessions}:{sessions:Session[]}) {
  const [offset,setOffset]=useState(0)
  const [selected,setSelected]=useState(()=>dayKey(new Date()))
  const days=useMemo(()=>dailyActivity(sessions),[sessions])
  const dates=calendarDays(new Date(),offset),today=dayKey(new Date()),detail=days.get(selected)
  const activeDays=dates.filter(d=>days.has(dayKey(d))).length
  return <section className="activity" aria-label="每日运动热力图">
    <h3>每日运动 · 全部动作</h3>
    <div className="activity-nav"><button onClick={()=>setOffset(n=>n-16)} aria-label="查看更早16周">←</button><span>{dayKey(dates[0])} — {dayKey(dates[111])}<br />本区间运动 {activeDays} 天</span><button disabled={offset===0} onClick={()=>setOffset(n=>Math.min(0,n+16))} aria-label="查看更新16周">→</button></div>
    <div className="heatmap">{dates.map(date=>{
      const key=dayKey(date),ms=days.get(key)?.durationMs ?? 0
      const level=!ms ? 0 : ms<300000 ? 1 : ms<900000 ? 2 : ms<1800000 ? 3 : 4
      return <button key={key} className={`heat-cell heat-${level}`} disabled={key>today} aria-pressed={selected===key} aria-label={`${key}，${ms ? duration(ms) : '无运动记录'}`} title={`${key} · ${duration(ms)}`} onClick={()=>setSelected(key)} />
    })}</div>
    <p className="history-note">每列一周，从上到下为周一至周日。颜色按每日训练用时：无记录、少于5分、5–15分、15–30分、30分以上。含组内休息，按结束日期归档。</p>
    <div className="heat-legend" aria-hidden="true">少 {[0,1,2,3,4].map(n=><i key={n} className={`heat-${n}`} />)} 多</div>
    <div className="day-detail" aria-live="polite"><strong>{selected} · {detail ? `${detail.sessions.length} 组 · ${duration(detail.durationMs)}` : '暂无运动记录'}</strong>
      {Object.entries(EXERCISE_NAMES).map(([exercise,name])=>{
        const list=detail?.sessions.filter(s=>s.exercise===exercise) ?? []
        return list.length ? <p key={exercise}>{name}：{list.length} 组 · {exercise==='plank' ? `保持 ${duration(list.reduce((n,s)=>n+(s.hold?.heldMs ?? 0),0))}` : `${list.reduce((n,s)=>n+s.repCount,0)} ${exercise==='russian_twist' ? '次转体' : '次'}`} · 用时 {duration(list.reduce((n,s)=>n+s.durationMs,0))}</p>:null
      })}
    </div>
  </section>
})
