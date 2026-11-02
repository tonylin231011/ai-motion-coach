import { useMemo, useState } from 'react'
import { ActivityHeatmap } from './ActivityHeatmap'
import { ExerciseIcon, Icon } from './CoachIcons'
import { WallSitHistoryProgress } from './WallSitProgress'
import { duration, readHistory, type Session } from './history'
import { downloadHistoryExport } from './historyExport'
import { EXERCISES, EXERCISE_NAMES, isTimedExercise, type Exercise } from './types'

function result(session: Session) {
  if (session.exercise === 'plank') return `保持 ${duration(session.hold?.heldMs ?? 0)}`
  if (session.exercise === 'wall_sit') return `达标 ${session.repCount} 组 · 保持 ${duration(session.hold?.heldMs ?? 0)}`
  if (session.exercise === 'dumbbell_curl') return `左 ${session.armCounts?.left ?? 0} · 右 ${session.armCounts?.right ?? 0}`
  return `${session.repCount} 次${session.exercise === 'squat' || (session.exercise === 'pushup' && session.countMode !== 'completed') ? '有效' : '完成'}`
}

export function TrainingHistory({ sessions, onSelect }: { sessions: Session[]; onSelect: (session: Session) => void }) {
  const [filter, setFilter] = useState<Exercise | 'all'>('all')
  const [exportStatus, setExportStatus] = useState('')
  const sorted = useMemo(() => [...sessions].sort((a, b) => b.endedAt - a.endedAt), [sessions])
  const filtered = filter === 'all' ? sorted : sorted.filter(s => s.exercise === filter)
  const today = filtered.filter(s => new Date(s.endedAt).toDateString() === new Date().toDateString())
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7)
  const activeDays = new Set(sessions.filter(s => s.endedAt >= +weekStart && s.endedAt <= Date.now()).map(s => new Date(s.endedAt).toDateString())).size
  const exportAll = () => {
    try { const all = readHistory(); downloadHistoryExport(all); setExportStatus(`已导出全部 ${all.length} 条记录，包含各动作计数单位与保持时长。`) }
    catch { setExportStatus('导出失败，请检查浏览器下载权限后重试。') }
  }
  return <section className="history-page" aria-label="训练记录">
    <div className="page-heading"><div><p className="eyebrow">每一次坚持，都有迹可循</p><h2>训练记录</h2></div><button className="secondary export-button" aria-label="导出全部训练记录" disabled={!sessions.length} onClick={exportAll}><Icon name="export" />导出</button></div>
    {exportStatus && <p className="notice" role="status">{exportStatus}</p>}
    <div className="history-totals"><div><span>累计记录</span><strong>{sessions.length}<small>条</small></strong></div><div><span>本周训练</span><strong>{activeDays}<small>天</small></strong></div></div>
    <ActivityHeatmap sessions={sessions} />
    <section className="recent-section"><div className="section-heading"><h3>最近训练</h3><span>{filtered.length} 条记录</span></div>
      <div className="history-filters" aria-label="按运动筛选"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部</button>{EXERCISES.map(kind => <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{EXERCISE_NAMES[kind]}</button>)}</div>
      {filter !== 'all' && <div className="filter-summary"><p>今日{isTimedExercise(filter) ? `保持 ${duration(today.reduce((n, s) => n + (s.hold?.heldMs ?? 0), 0))}` : `${EXERCISE_NAMES[filter]} ${today.reduce((n, s) => n + s.repCount, 0)} 次`} · 累计用时 {duration(filtered.reduce((n, s) => n + s.durationMs, 0))}</p>{filter === 'dumbbell_curl' && <p>累计左手 {filtered.reduce((n, s) => n + (s.armCounts?.left ?? 0), 0)} 次 · 右手 {filtered.reduce((n, s) => n + (s.armCounts?.right ?? 0), 0)} 次</p>}</div>}
      {filter === 'wall_sit' && <WallSitHistoryProgress sessions={filtered} />}
      {!filtered.length && <div className="empty-history"><Icon name="history" /><h3>从第一组开始</h3><p>完成训练并保存后，记录会出现在这里。</p></div>}
      <div className="history-list">{filtered.map(session => <button className="history-entry" key={session.id} onClick={() => onSelect(session)}>
        <ExerciseIcon exercise={session.exercise} /><span className="history-entry-main"><small>{new Date(session.endedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small><b>{EXERCISE_NAMES[session.exercise]}</b><span>{result(session)}</span><small>训练用时 {duration(session.durationMs)}{session.exercise === 'russian_twist' ? ' · 每侧计一次' : session.exercise === 'dumbbell_curl' ? ' · 每只手计一次' : ''}</small></span><Icon name="arrow" />
      </button>)}</div>
    </section>
    <p className="history-note">训练用时包含组内休息，保持时长单独记录。云端同步状态可在页首查看；请勿清除浏览器站点数据。导出包含全部运动，不受筛选影响。</p>
  </section>
}
