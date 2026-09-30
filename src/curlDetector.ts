import type { RepRecord } from './coachDetector'
import type { ArmSide, Landmarks, Point, SquatPhase, SquatSnapshot } from './types'

export const curlCues = {
  ready: '准备好了！上臂尽量稳住，弯起来，再控制着放下。每只手单独计数！',
  good1: '好！弯起再放回，完成一次。上臂稳住，继续！',
  good2: '漂亮！这一遍弯起和放下都看到了，继续保持控制！',
  good3: '又拿下一次！别急着追次数，认真控制放下的过程！',
  shallow: '这次看到的弯举幅度偏小。按舒适范围弯起，再控制着放回！',
  fast: '稳住！这次节奏偏快。下一次弯起后慢慢放下，别赶次数！',
  unclear: '肩、肘和手腕刚才没看清。手机放稳，让要训练的手臂完整入镜！',
}

type ArmState = {
  phase: SquatPhase
  angle: number | null
  top: number
  minimum: number
  started: number
  lastSeen: number | null
  dwellSince: number | null
  dwellFrames: number
  reached: boolean
}
const sides: ArmSide[] = ['left', 'right']
const freshArm = (): ArmState => ({ phase: 'WAITING', angle: null, top: 180, minimum: 180,
  started: 0, lastSeen: null, dwellSince: null, dwellFrames: 0, reached: false })
function dwell(arm: ArmState, condition: boolean, time: number) {
  if (!condition) { arm.dwellSince = null; arm.dwellFrames = 0; return false }
  arm.dwellSince ??= time
  arm.dwellFrames++
  return arm.dwellFrames >= 2 && time - arm.dwellSince >= 120
}
function clearDwell(arm: ArmState) { arm.dwellSince = null; arm.dwellFrames = 0 }
function angleOf(points: (Point | undefined)[], width: number, height: number) {
  if (!points.every((p): p is Point => !!p && p.visibility >= .5 &&
    Number.isFinite(p.visibility) && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return null
  const [a, b, c] = points as Point[]
  const ax = (a.x - b.x) * width, ay = (a.y - b.y) * height
  const cx = (c.x - b.x) * width, cy = (c.y - b.y) * height
  const lengths = Math.hypot(ax, ay) * Math.hypot(cx, cy)
  if (lengths < 1e-8) return null
  return { angle: Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / lengths))) * 180 / Math.PI,
    confidence: Math.min(...points.map(p => p!.visibility)) }
}

/** Independent visible elbow cycles, not dumbbell/load recognition or a full-form assessment.
 * Degree/time gates are prototype noise filters, not prescribed medical or training standards. */
export class CurlDetector {
  private arms = { left: freshArm(), right: freshArm() }
  private counts = { left: 0, right: 0 }
  private attempts = 0
  private records: RepRecord[] = []
  private lastTime = -Infinity
  private feedbackId = 0
  private cue: keyof typeof curlCues | undefined

  reset() {
    this.arms = { left: freshArm(), right: freshArm() }
    this.counts = { left: 0, right: 0 }; this.attempts = 0; this.records = []
    this.lastTime = -Infinity; this.feedbackId = 0; this.cue = undefined
  }
  getStats() {
    return { repCount: this.counts.left + this.counts.right, attemptCount: this.attempts,
      records: this.records.map(r => ({ ...r })), armCounts: { ...this.counts } }
  }
  private feedback(cue: keyof typeof curlCues) { this.cue = cue; this.feedbackId++ }

  update(landmarks: Landmarks, timestamp = performance.now(), width = 1, height = 1): SquatSnapshot {
    const angles = { left: null, right: null } as Record<ArmSide, number | null>
    let confidence = 0
    let correctedThisFrame = false
    // Repeated/out-of-order timestamps cannot advance confirmation timers.
    const advance = Number.isFinite(timestamp) && timestamp > this.lastTime
    const validSize = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    if (advance) this.lastTime = timestamp
    for (const side of sides) {
      let arm = this.arms[side]
      const reading = validSize ? angleOf([landmarks[`${side}_shoulder`], landmarks[`${side}_elbow`],
        landmarks[`${side}_wrist`]], width, height) : null
      if (!advance) {
        angles[side] = reading ? arm.angle : null
        confidence = Math.max(confidence, reading?.confidence ?? 0)
        continue
      }
      // Tolerate a brief wrist occlusion, but never confirm transitions using missing frames.
      if (!reading) {
        clearDwell(arm)
        if (arm.lastSeen !== null && timestamp - arm.lastSeen > 650) {
          if (arm.phase !== 'WAITING' && arm.phase !== 'STANDING') this.feedback('unclear')
          this.arms[side] = freshArm()
        }
        continue
      }
      if (arm.lastSeen !== null && timestamp - arm.lastSeen > 650) {
        if (arm.phase !== 'WAITING' && arm.phase !== 'STANDING') this.feedback('unclear')
        arm = this.arms[side] = freshArm()
      }
      confidence = Math.max(confidence, reading.confidence)
      arm.lastSeen = timestamp
      arm.angle = arm.angle === null ? reading.angle : .75 * reading.angle + .25 * arm.angle
      const angle = arm.angle
      angles[side] = angle
      if (arm.phase === 'WAITING') {
        if (dwell(arm, angle >= 150, timestamp)) {
          arm.phase = 'STANDING'; arm.top = angle; clearDwell(arm)
          if (!this.cue) this.feedback('ready')
        }
      } else if (arm.phase === 'STANDING') {
        arm.top = Math.max(arm.top, angle)
        if (dwell(arm, angle < arm.top - 20 && angle < 140, timestamp)) {
          arm.phase = 'DESCENDING'; arm.started = arm.dwellSince!; arm.minimum = angle
          // Carry the confirmed movement window into flexion; do not demand a second long hold.
          arm.reached = false; this.attempts++
        }
      } else {
        arm.minimum = Math.min(arm.minimum, angle)
        const atReturn = angle >= Math.max(140, arm.top - 22)
        if (!arm.reached && !atReturn && dwell(arm, arm.top - angle >= 45 && angle <= 120, timestamp)) {
          arm.reached = true; arm.phase = 'BOTTOM'; clearDwell(arm)
        }
        if (arm.reached && angle > arm.minimum + 15) arm.phase = 'ASCENDING'
        // Clear the flexion confirmation before starting the return confirmation.
        if (atReturn) {
          if (dwell(arm, true, timestamp)) {
            const durationMs = timestamp - arm.started
            if (arm.reached && durationMs >= 450) {
              const issue = arm.minimum > 105 ? 'shallow' : durationMs < 1000 ? 'fast' : null
              this.counts[side]++
              this.records.push({ side, durationMs, minAngle: arm.minimum, valid: true, issue })
              const total = this.counts.left + this.counts.right
              // Preserve a correction if both hands complete in the same frame.
              if (issue || !correctedThisFrame)
                this.feedback(issue ?? (['good1', 'good2', 'good3'] as const)[(total - 1) % 3])
              correctedThisFrame ||= issue !== null
            }
            arm.phase = 'STANDING'; arm.reached = false; clearDwell(arm)
          }
        } else if (arm.reached) clearDwell(arm)
      }
    }
    const visible = sides.filter(side => angles[side] !== null)
    const active = visible.map(side => this.arms[side].phase)
    const phase = active.find(p => p !== 'WAITING' && p !== 'STANDING') ??
      (active.includes('STANDING') ? 'STANDING' : 'WAITING')
    const reason = !visible.length ? '请拍清至少一侧的肩、肘和手腕；不需要拍到脚' :
      visible.length === 1 ? `仅看清${visible[0] === 'left' ? '左' : '右'}手，另一手暂不计数` : '左右手独立计数'
    return { phase, repCount: this.counts.left + this.counts.right, attemptCount: this.attempts,
      armCounts: { ...this.counts }, elbowAngles: angles,
      averageElbowAngle: visible.length ? visible.reduce((sum, side) => sum + angles[side]!, 0) / visible.length : null,
      averageKneeAngle: null, hipDisplacement: null, confidence, trackingReason: reason,
      feedbackId: this.feedbackId, cue: this.cue,
      feedback: !visible.length ? reason : phase === 'WAITING' ? '先把手臂自然放下，再开始弯举' :
        `${this.cue ? curlCues[this.cue] : '控制弯起，再慢慢放下'}${visible.length === 1 ? `（${reason}）` : ''}` }
  }
}
