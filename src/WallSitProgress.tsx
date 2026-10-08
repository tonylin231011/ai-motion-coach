import type { WallSitStats } from './types'
import type { Session } from './history'
import { duration } from './history'

export function WallSitProgress({ stats }: { stats: WallSitStats }) {
  return <div className="wall-sit-progress" aria-label="本组静蹲进度">
    <label htmlFor="wall-sit-progress">本组 {Math.floor(stats.currentMs / 1000)} / {stats.targetMs / 1000} 秒 · 已达标 {stats.completedSets} 组</label>
    <progress id="wall-sit-progress" max={stats.targetMs} value={Math.min(stats.currentMs, stats.targetMs)} />
    <small>{stats.currentMs >= stats.targetMs ? '目标完成！可以暂停休息；继续保持不重复加组。' : '连续保持达到目标算一组；暂停后下一组从零开始。'}</small>
  </div>
}

export function WallSitHistoryProgress({ sessions }: { sessions: Session[] }) {
  const list = sessions.filter(s => s.exercise === 'wall_sit').sort((a, b) => b.endedAt - a.endedAt)
  const bestMs = Math.max(0, ...list.map(s => s.hold?.bestMs ?? 0))
  const latest = list[0], previous = list[1]
  const change = latest && previous ? Math.round(((latest.hold?.bestMs ?? 0) - (previous.hold?.bestMs ?? 0)) / 1000) : null
  return <section className="wall-sit-history" aria-label="静蹲进步跟踪">
    <h3>靠墙静蹲 · 进步跟踪</h3>
    <p>累计达标 {list.reduce((n, s) => n + s.repCount, 0)} 组 / 尝试 {list.reduce((n, s) => n + s.attemptCount, 0)} 组</p>
    <p>累计保持 {duration(list.reduce((n, s) => n + (s.hold?.heldMs ?? 0), 0))} · 历史最长 {duration(bestMs)}</p>
    {latest && <p>最近一次最长 {duration(latest.hold?.bestMs ?? 0)}{change !== null ? ` · 较上次${change > 0 ? '+' : ''}${change}秒` : ' · 完成下一次后可比较进步'}</p>}
    <small>按实际连续时长比较；目标和蹲深不同，不能直接比较动作质量。</small>
  </section>
}
