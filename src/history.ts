import type { RepRecord } from './coachDetector'
import { EXERCISES, type ArmCounts, type Exercise, type HoldStats } from './types'
export type Session = { curlCountUnit?:'arm_reps'; armCounts?:ArmCounts; twistCountUnit?:'sides'; legacyTwistPairs?:boolean; hold?:HoldStats; countMode?: 'completed'; exercise: Exercise; id: string; endedAt: number; durationMs: number; repCount: number; attemptCount: number; records: RepRecord[] }
const KEY = 'motion-coach.sessions.v1'
export function readHistory(): Session[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '[]')
    const data: unknown = Array.isArray(raw) ? raw.map(s=>s && ({...s,exercise:s.exercise ?? 'squat',...(s.exercise==='russian_twist' && s.twistCountUnit!=='sides' ? {repCount:s.repCount*2,attemptCount:s.attemptCount*2,twistCountUnit:'sides',legacyTwistPairs:true} : {})})).filter(s=>s && EXERCISES.includes(s.exercise) && (s.exercise!=='plank' || (s.hold && [s.hold.heldMs,s.hold.bestMs,s.hold.breaks].every(n=>Number.isFinite(n) && n>=0))) && (s.exercise!=='dumbbell_curl' || (s.curlCountUnit==='arm_reps' && s.armCounts && [s.armCounts.left,s.armCounts.right].every(n=>Number.isInteger(n) && n>=0) && s.armCounts.left+s.armCounts.right===s.repCount))) : []
    return Array.isArray(data) ? data.filter((s): s is Session => s && typeof s.id==='string' && Number.isFinite(s.endedAt) && Number.isFinite(s.durationMs) && Number.isInteger(s.repCount) && Number.isInteger(s.attemptCount) && Array.isArray(s.records) && s.records.every((r: RepRecord)=>r && Number.isFinite(r.durationMs) && Number.isFinite(r.minAngle) && typeof r.valid==='boolean' && [null,'shallow','fast'].includes(r.issue))) : []
  } catch { return [] }
}
export function saveSession(session: Session): Session[] {
  const sessions = [session,...readHistory().filter(s=>s.id!==session.id)]
  localStorage.setItem(KEY,JSON.stringify(sessions))
  return sessions
}
export function duration(ms: number) { const seconds=Math.floor(ms/1000); return `${Math.floor(seconds/60)}分${seconds%60}秒` }
export function review(session: Session) {
  if(session.exercise==='dumbbell_curl') {
    const {left=0,right=0}=session.armCounts ?? {}
    const shallow=session.records.filter(r=>r.issue==='shallow').length
    const fast=session.records.filter(r=>r.issue==='fast').length
    return `本组左手 ${left} 次、右手 ${right} 次，共 ${session.repCount} 次（每只手各计一次）。${!session.repCount ? '先自然放下手臂，让肩、肘和手腕入镜，再弯起并放回。' : shallow ? `有 ${shallow} 次可见幅度偏小；按舒适范围完成弯起和放下。` : '看到了弯起和放回，继续保持上臂稳定。'}${fast ? `有 ${fast} 次节奏偏快，下一组控制放下。` : ''}仅评价可见肘角和节奏，不识别哑铃重量或肌肉发力。`
  }
  if(session.exercise==='reverse_crunch') return `本组看到 ${session.repCount} 次收膝再放回。${session.repCount ? '保持侧面拍摄和可控节奏。' : '请从侧面拍到肩、髋和膝，先把腿放远，再收膝并放回。'}这只是可见动作计数，不能判断骨盆抬起或腰背姿态是否标准。`
  if(session.exercise==='russian_twist') return `本组完成 ${session.repCount} 次转体（每侧计一次）。${session.legacyTwistPairs ? '旧版左右组数按每组两次换算，不补回曾经漏识别的动作。' : ''}${session.records.some(r=>r.issue==='fast') ? '部分换边偏快，下一组注意控制节奏。' : session.repCount ? '保持双手随身体移向两侧，按舒适幅度完成。' : '请正面入镜，让双肩、髋和双手清晰可见。'}计数依据手部轨迹，不代表完整动作质量。`
  if(session.exercise==='plank' && session.hold?.timerMode==='assisted') return `本组自动起表后累计 ${duration(session.hold.heldMs)}，最长连续 ${duration(session.hold.bestMs)}，暂停 ${session.hold.breaks} 次。开始后连续计时，由操作或切换后台暂停，不表示动作已达标。`
  if(session.exercise==='plank' && session.hold?.timerMode==='manual') return `本组自主计时 ${duration(session.hold.heldMs)}，最长连续 ${duration(session.hold.bestMs)}，暂停 ${session.hold.breaks} 次。暂停由操作或切换后台触发，识别掉点不扣时；这份记录不表示动作已经达标。`
  if(session.exercise==='plank') return !session.hold?.heldMs ? '本组未累计到保持时长。让肩、肘和手腕清晰入镜，准备好前臂支撑后，看到秒数增长再继续。' : `本组累计保持 ${duration(session.hold.heldMs)}，最长连续 ${duration(session.hold.bestMs)}，中断 ${session.hold.breaks} 次。${session.hold.breaks ? '下一组优先保持稳定，识别中断也会计入中断次数。' : '保持稳定，休息后再开始下一组。'}`
  const shallow=session.records.filter(r=>r.issue==='shallow').length
  const fast=session.records.filter(r=>r.issue==='fast').length
  const unobserved=session.attemptCount-session.records.length
  if(!session.attemptCount) return session.exercise==='pushup' ? '本组没有识别到完整动作。请保持手机固定，让肩、肘和手腕清晰入镜，正常下压再推回。' : '本组还没有识别到下蹲。下次先侧身站稳，让髋、膝和脚完整入镜。'
  if(shallow) return `有 ${shallow} 次幅度偏小。下一组优先保持舒适、完整的幅度，再增加次数。${fast ? `另有 ${fast} 次节奏偏快。` : ''}`
  if(fast) return `有 ${fast} 次节奏偏快。下一组先找回动作控制，不急着追次数。`
  if(unobserved) return `有 ${unobserved} 次未完整观察到。下一组保持动作关键部位入镜，并回到起始姿势再开始。`
  return '本组观察到的幅度与完成度保持良好。休息后，下一组继续保持同样的动作质量！'
}
