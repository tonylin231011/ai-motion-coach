import { useMemo, useState } from 'react'
import { ActivityHeatmap } from './ActivityHeatmap'
import { ExerciseIcon, Icon } from './CoachIcons'
import { WallSitHistoryProgress } from './WallSitProgress'
import { duration, type Session } from './history'
import { dayKey } from './activity'
import { deltaLabel, historyOverview, quality, QUALITY_NOTE } from './workoutMetrics'
import { EXERCISES, EXERCISE_NAMES, isTimedExercise, type Exercise } from './types'

function result(session: Session) {
  if (session.exercise === 'plank') return `保持 ${duration(session.hold?.heldMs ?? 0)}`
  if (session.exercise === 'wall_sit') return `达标 ${session.repCount} 组 · 保持 ${duration(session.hold?.heldMs ?? 0)}`
  if (session.exercise === 'dumbbell_curl') return `左 ${session.armCounts?.left ?? 0} · 右 ${session.armCounts?.right ?? 0}`
  return `${session.repCount} 次${session.exercise === 'squat' || (session.exercise === 'pushup' && session.countMode !== 'completed') ? '有效' : '完成'}`
}

export function TrainingHistory({ sessions, onSelect, weeklyTarget=3 }: { sessions: Session[]; onSelect: (session: Session) => void; weeklyTarget?:number }) {
  const [filter, setFilter] = useState<Exercise | 'all'>('all')
  const [selectedDay,setSelectedDay]=useState('')
  const sorted = useMemo(() => [...sessions].sort((a, b) => b.endedAt - a.endedAt), [sessions])
  const filtered = sorted.filter(s=>(filter==='all'||s.exercise===filter)&&(!selectedDay||dayKey(new Date(s.endedAt))===selectedDay))
  const today = filtered.filter(s => new Date(s.endedAt).toDateString() === new Date().toDateString())
  const overview=historyOverview(sessions,new Date(),weeklyTarget)
  const comparisons=useMemo(()=>{const result=new Map<string,number|null>(),previous=new Map<Exercise,Session>();for(const s of [...sorted].reverse()){const old=previous.get(s.exercise);result.set(s.id,old?quality([old]).percent:null);previous.set(s.exercise,s)}return result},[sorted])
  return <section className="history-page" aria-label="训练记录">
    <div className="page-heading"><div><p className="eyebrow">每一次坚持，都有迹可循</p><h2>训练记录</h2></div></div>
    <div className="history-totals v2-history-totals"><div><span>连续训练</span><strong>{overview.streak}<small>天</small></strong></div><div><span>本周目标</span><strong>{overview.weekDays}<small>/ {weeklyTarget} 天</small></strong></div><div><span>近 7 天可见标准率</span><strong>{overview.recentQuality.percent===null?'—':`${overview.recentQuality.percent}%`}</strong></div></div>
    <details className="quality-explanation"><summary>这些数字如何计算？</summary><p>{QUALITY_NOTE}近 7 天按完整观察次数加权计算，静态保持不参与。连续天数允许今天尚未训练；本周目标可在设置调整。</p></details>
    <ActivityHeatmap sessions={sessions} onSelectDay={setSelectedDay} />
    <section className="recent-section"><div className="section-heading"><h3>最近训练</h3><span>{filtered.length} 条记录</span></div>
      <div className="history-filters" aria-label="按运动筛选"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部</button>{EXERCISES.map(kind => <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{EXERCISE_NAMES[kind]}</button>)}</div>
      {selectedDay&&<button className="day-filter-reset secondary" onClick={()=>setSelectedDay('')}>{selectedDay} · 查看全部日期</button>}
      {filter !== 'all' && <div className="filter-summary"><p>今日{isTimedExercise(filter) ? `保持 ${duration(today.reduce((n, s) => n + (s.hold?.heldMs ?? 0), 0))}` : `${EXERCISE_NAMES[filter]} ${today.reduce((n, s) => n + s.repCount, 0)} 次`} · 累计用时 {duration(filtered.reduce((n, s) => n + s.durationMs, 0))}</p>{filter === 'dumbbell_curl' && <p>累计左手 {filtered.reduce((n, s) => n + (s.armCounts?.left ?? 0), 0)} 次 · 右手 {filtered.reduce((n, s) => n + (s.armCounts?.right ?? 0), 0)} 次</p>}</div>}
      {filter === 'wall_sit' && <WallSitHistoryProgress sessions={filtered} />}
      {!filtered.length && <div className="empty-history"><Icon name="history" /><h3>从第一组开始</h3><p>完成训练并保存后，记录会出现在这里。</p></div>}
      <div className="history-list">{filtered.map(session => <button className="history-entry" key={session.id} onClick={() => onSelect(session)}>
        <ExerciseIcon exercise={session.exercise} /><span className="history-entry-main"><small>{new Date(session.endedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small><b>{EXERCISE_NAMES[session.exercise]}</b><span>{result(session)}</span><small>可见标准率 {quality([session]).percent===null?'未评估':`${quality([session]).percent}%`} · {deltaLabel(quality([session]).percent,comparisons.get(session.id)??null)}</small><small>训练用时 {duration(session.durationMs)}{session.exercise === 'russian_twist' ? ' · 每侧计一次' : session.exercise === 'dumbbell_curl' ? ' · 每只手计一次' : ''}</small></span><Icon name="arrow" />
      </button>)}</div>
    </section>
    <p className="history-note">共 {sessions.length} 条记录。训练用时包含组内休息，保持时长单独记录。导出已移到设置；请勿清除浏览器站点数据。</p>
  </section>
}
