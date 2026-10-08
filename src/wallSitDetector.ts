import type { HoldStats, Landmarks, Point, SquatSnapshot, WallSitSet, WallSitStats } from './types'
import type { RepRecord } from './coachDetector'

export const wallSitCues = {
  ready: '开始计时。背贴墙，脚踩稳，保持自然呼吸。',
  pause: '本组计时暂停。休息好，重新开始下一组。',
  goal: '本组目标已完成。可以起身休息，请点暂停；继续保持不会重复加组。',
  breathe: '稳住身体，自然呼吸，不要憋气。累了可以提前休息。',
  unclear: '侧面拍清肩、髋、膝和脚踝。看不清时可以手动开始计时。',
}

/** Assisted start only: a single camera cannot establish contact with the wall.
 * After starting, rests must be explicit so occlusion cannot silently lose time. */
export class WallSitDetector {
  readonly targetMs: number
  readonly timerMode: 'manual' | 'assisted'
  private active = false
  private userPaused = false
  private last = 0
  private frameAt: number | null = null
  private candidateAt: number | null = null
  private currentMs = 0
  private currentCompleted = false
  private sets: WallSitSet[] = []
  private hold: HoldStats = { heldMs: 0, bestMs: 0, breaks: 0 }
  private feedbackId = 0
  private cue: keyof typeof wallSitCues | undefined
  private breatheBucket = 0

  constructor(timerMode: 'manual' | 'assisted' = 'assisted', targetMs = 20000) {
    if (!Number.isFinite(targetMs) || targetMs < 5000 || targetMs > 120000) throw new Error('静蹲目标应为 5–120 秒')
    this.targetMs = targetMs
    this.timerMode = timerMode
  }
  get running() { return this.active }
  reset() {
    this.active = false; this.userPaused = false; this.last = 0; this.frameAt = null; this.candidateAt = null
    this.currentMs = 0; this.currentCompleted = false; this.sets = []
    this.hold = { heldMs: 0, bestMs: 0, breaks: 0 }; this.feedbackId = 0; this.cue = undefined; this.breatheBucket = 0
  }
  private say(cue: keyof typeof wallSitCues) { this.cue = cue; this.feedbackId++ }
  tick(t = performance.now()) {
    if (this.active) {
      const delta = Math.max(0, t - this.last)
      this.last = Math.max(this.last, t)
      this.currentMs += delta; this.hold.heldMs += delta
      this.hold.bestMs = Math.max(this.hold.bestMs, this.currentMs)
      if (!this.currentCompleted && this.currentMs >= this.targetMs) {
        this.currentCompleted = true; this.say('goal')
      } else if (Math.floor(this.currentMs / 15000) > this.breatheBucket) this.say('breathe')
      this.breatheBucket = Math.floor(this.currentMs / 15000)
    }
    return { ...this.hold, timerMode: this.timerMode }
  }
  private closeSet() {
    this.sets.push({ heldMs: this.currentMs, completed: this.currentCompleted })
    this.active = false; this.currentMs = 0; this.currentCompleted = false; this.breatheBucket = 0
  }
  setRunning(running: boolean, t = performance.now()) {
    this.tick(t)
    if (running === this.active) return
    this.candidateAt = null
    if (running) { this.active = true; this.last = t; this.userPaused = false; this.say('ready') }
    else { this.closeSet(); this.hold.breaks++; this.userPaused = true; this.say('pause') }
  }
  finish(t = performance.now()) {
    this.tick(t)
    if (this.active) this.closeSet()
    this.userPaused = true; this.candidateAt = null
  }
  getStats() {
    const sets = [...this.sets.map(s => ({ ...s })), ...(this.active ? [{ heldMs: this.currentMs, completed: this.currentCompleted }] : [])]
    const wallSit: WallSitStats = { targetMs: this.targetMs, completedSets: sets.filter(s => s.completed).length, currentMs: this.currentMs, sets }
    return { repCount: wallSit.completedSets, attemptCount: sets.length, records: [] as RepRecord[], hold: { ...this.hold, timerMode: this.timerMode }, wallSit }
  }
  snapshot(feedback = this.active
    ? this.currentCompleted ? '本组已达标；可以暂停休息，继续保持不重复加组。' : '正在计时；休息请点“暂停本组”。'
    : this.userPaused ? '已暂停；休息后点“开始下一组”，时长重新计算。' : '准备好后开始静蹲。'): SquatSnapshot {
    return { ...this.getStats(), phase: this.active ? 'STANDING' : 'WAITING', averageKneeAngle: null,
      hipDisplacement: null, confidence: 0, feedback, feedbackId: this.feedbackId, cue: this.cue }
  }
  update(l: Landmarks, t = performance.now(), width = 1, height = 1): SquatSnapshot {
    const good = (p: Point | undefined): p is Point => !!p && p.visibility >= .5 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
    const candidates = (['left', 'right'] as const).map(s => [l[`${s}_shoulder`], l[`${s}_hip`], l[`${s}_knee`], l[`${s}_ankle`]])
      .filter((side): side is Point[] => side.every(good)).sort((a, b) => Math.min(...b.map(p => p.visibility)) - Math.min(...a.map(p => p.visibility)))
    let feedback = wallSitCues.unclear, angle: number | null = null, confidence = 0, ready = false
    const side = candidates[0]
    if (side && width > 0 && height > 0) {
      const [s, h, k, a] = side
      const ux = (h.x - k.x) * width, uy = (h.y - k.y) * height, vx = (a.x - k.x) * width, vy = (a.y - k.y) * height
      const thigh = Math.hypot(ux, uy), shin = Math.hypot(vx, vy)
      confidence = Math.min(...side.map(p => p.visibility))
      if (Math.min(thigh, shin) >= Math.min(width, height) * .04) {
        angle = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (thigh * shin)))) * 180 / Math.PI
        const upright = (h.y - s.y) * height > height * .04 && Math.abs(h.x - s.x) * width < (h.y - s.y) * height * .6
        ready = angle >= 85 && angle <= 140 && upright && vy > shin * .8 && Math.abs(ux) > thigh * .65
        feedback = ready ? '已看到静蹲姿势；请自己确认背贴墙、双脚踩稳。' : '背贴墙，在舒适范围下蹲；从侧面拍摄，让小腿接近竖直。新手可蹲浅一些。'
      }
    }
    const gap = this.frameAt !== null && (t - this.frameAt > 700 || t < this.frameAt)
    this.frameAt = t
    if (this.timerMode === 'assisted' && !this.active && !this.userPaused) {
      if (!ready || gap) this.candidateAt = null
      else {
        this.candidateAt ??= t
        if (t - this.candidateAt >= 800) this.setRunning(true, t)
      }
    }
    this.tick(t)
    const reason = this.active ? `${this.currentCompleted ? '本组已达标，继续保持不重复加组。' : '计时中。'}${ready ? feedback : '姿态未确认。'}休息请点“暂停本组”。`
      : this.userPaused ? '已暂停；休息后点“开始下一组”，时长重新计算。'
      : this.timerMode === 'manual' ? '背贴墙准备好，点“开始本组”计时。' : `${feedback}看不清时可点“手动开始本组”。`
    return { ...this.snapshot(reason), averageKneeAngle: angle, confidence }
  }
}
