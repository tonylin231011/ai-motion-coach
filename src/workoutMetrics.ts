import { dayKey } from './activity'
import type { Session } from './history'
import { isTimedExercise, type Exercise } from './types'

export type TrainingPlan = { sets: number; target: number; restSeconds: number }
export const QUALITY_NOTE = '可见动作标准率＝完整观察中，幅度达标且无节奏提示的次数占比。未观察完整不评分；不是全身姿势或安全认证。'
export function quality(sessions: Session[]) {
  const records = sessions.filter(s => !isTimedExercise(s.exercise)).flatMap(s => s.records)
  const good = records.filter(r => r.valid && r.issue === null).length
  return { observed: records.length, good, percent: records.length ? Math.round(good / records.length * 100) : null }
}
export function previousSession(history: Session[], exercise: Exercise, before = Infinity) {
  return history.filter(s => s.exercise === exercise && s.endedAt < before).sort((a, b) => b.endedAt - a.endedAt)[0]
}
export function recommendation(history: Session[], exercise: Exercise): TrainingPlan {
  const previous = previousSession(history, exercise)
  // Repeat a manageable prior amount; never infer load, RPE or prescribe progression.
  const amount = isTimedExercise(exercise) ? Math.round((previous?.hold?.bestMs ?? 30000) / 1000) : previous?.repCount || 10
  return { sets: 3, target: Math.max(isTimedExercise(exercise) ? 10 : 1, Math.min(isTimedExercise(exercise) ? 120 : 60, amount)), restSeconds: 45 }
}
export function deltaLabel(current: number | null, previous: number | null) {
  if (current === null || previous === null) return '暂无可比数据'
  const delta = current - previous
  return delta ? `较上次 ${delta > 0 ? '+' : ''}${delta} 个百分点` : '与上次持平'
}
export function historyOverview(sessions: Session[], now = new Date(), weeklyTarget = 3) {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const active = new Set(sessions.filter(s => s.durationMs > 0 && s.endedAt <= +now).map(s => dayKey(new Date(s.endedAt))))
  const day = new Date(today)
  if (!active.has(dayKey(day))) day.setDate(day.getDate() - 1)
  let streak = 0
  while (active.has(dayKey(day))) { streak++; day.setDate(day.getDate() - 1) }
  const monday = new Date(today); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  const from = new Date(today); from.setDate(from.getDate() - 6)
  const weekDays = new Set(sessions.filter(s => s.durationMs > 0 && s.endedAt >= +monday && s.endedAt <= +now).map(s => dayKey(new Date(s.endedAt)))).size
  return { streak, weekDays, weeklyTarget, recentQuality: quality(sessions.filter(s => s.endedAt >= +from && s.endedAt <= +now)) }
}

export function biggestIssue(sessions: Session[]) {
  const records = sessions.flatMap(s => s.records)
  const shallow = records.filter(r => r.issue === 'shallow').length
  const fast = records.filter(r => r.issue === 'fast').length
  if (shallow >= fast && shallow) return { count:shallow,title: '动作幅度', text: `${shallow} 次出现幅度提示。下一组先保持舒适、可控的幅度；疲劳时延长休息。` }
  if (fast) return { count:fast,title: '动作节奏', text: `${fast} 次出现节奏偏快提示。下一组放慢回程，先稳住控制。` }
  if (!records.length) return { count:0,title: '保持与观察', text: '本次没有可评分的完整动作明细。静态保持时长不代表姿势达标。' }
  return { count:0,title: '继续保持', text: '本次完整观察的动作未出现幅度或节奏提示；这不代表不可见部位也已达标。' }
}
