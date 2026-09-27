import type { Landmarks, Point, SquatPhase, SquatSnapshot } from './types'

const angleAt = (a: Point, b: Point, c: Point) => {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }
  const denominator = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y)
  if (denominator === 0) return null
  const cosine = Math.max(-1, Math.min(1, (ab.x * cb.x + ab.y * cb.y) / denominator))
  return (Math.acos(cosine) * 180) / Math.PI
}

const average = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

/** A small, deliberately transparent V1 state machine. Thresholds are calibration targets. */
export class SquatDetector {
  private phase: SquatPhase = 'WAITING'
  private repCount = 0
  private attemptCount = 0
  private standingHipY: number | null = null
  private previousHipY: number | null = null

  reset() {
    this.phase = 'WAITING'
    this.repCount = 0
    this.attemptCount = 0
    this.standingHipY = null
    this.previousHipY = null
  }

  update(landmarks: Landmarks): SquatSnapshot {
    const leftAngle = this.kneeAngle(landmarks.left_hip, landmarks.left_knee, landmarks.left_ankle)
    const rightAngle = this.kneeAngle(landmarks.right_hip, landmarks.right_knee, landmarks.right_ankle)
    const averageKneeAngle = average([leftAngle, rightAngle])
    const hips = [landmarks.left_hip, landmarks.right_hip].filter((point): point is Point => Boolean(point))
    const hipY = hips.length ? hips.reduce((sum, hip) => sum + hip.y, 0) / hips.length : null
    const confidence = average(Object.values(landmarks).map((point) => point?.visibility ?? null)) ?? 0

    if (hipY === null || averageKneeAngle === null || confidence < 0.45) {
      return this.snapshot(averageKneeAngle, null, confidence, '请回到镜头中央')
    }

    if (this.standingHipY === null && averageKneeAngle > 155) this.standingHipY = hipY
    const hipDisplacement = this.standingHipY === null ? null : hipY - this.standingHipY
    const verticalVelocity = this.previousHipY === null ? 0 : hipY - this.previousHipY
    this.previousHipY = hipY

    if (this.phase === 'WAITING' && averageKneeAngle > 155) this.phase = 'STANDING'
    if (this.phase === 'STANDING' && averageKneeAngle < 148 && verticalVelocity > 0) {
      this.phase = 'DESCENDING'
      this.attemptCount += 1
    }
    if (this.phase === 'DESCENDING' && averageKneeAngle < 108) this.phase = 'BOTTOM'
    if (this.phase === 'BOTTOM' && averageKneeAngle > 116 && verticalVelocity < 0) this.phase = 'ASCENDING'
    if (this.phase === 'ASCENDING' && averageKneeAngle > 158) {
      this.phase = 'STANDING'
      this.repCount += 1
      this.standingHipY = hipY
    }

    const feedback = this.phase === 'BOTTOM' && averageKneeAngle > 92 ? '不错，保持稳定' : this.phase === 'DESCENDING' ? '慢慢下蹲' : this.phase === 'ASCENDING' ? '起身，站稳' : '准备开始'
    return this.snapshot(averageKneeAngle, hipDisplacement, confidence, feedback)
  }

  private kneeAngle(hip?: Point, knee?: Point, ankle?: Point) {
    return hip && knee && ankle ? angleAt(hip, knee, ankle) : null
  }

  private snapshot(averageKneeAngle: number | null, hipDisplacement: number | null, confidence: number, feedback: string): SquatSnapshot {
    return { phase: this.phase, repCount: this.repCount, attemptCount: this.attemptCount, averageKneeAngle, hipDisplacement, confidence, feedback }
  }
}
