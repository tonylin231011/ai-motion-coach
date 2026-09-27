export type LandmarkName =
  | 'left_elbow' | 'right_elbow' | 'left_wrist' | 'right_wrist'
  | 'left_shoulder' | 'right_shoulder' | 'left_hip' | 'right_hip'
  | 'left_knee' | 'right_knee' | 'left_ankle' | 'right_ankle'

export type Point = { x: number; y: number; z: number; visibility: number }
export type Landmarks = Partial<Record<LandmarkName, Point>>

export type SquatPhase = 'WAITING' | 'STANDING' | 'DESCENDING' | 'BOTTOM' | 'ASCENDING'
export type TrackingState = 'IDLE' | 'TRACKING' | 'LOST'
export type Exercise = 'squat' | 'pushup' | 'plank' | 'russian_twist' | 'reverse_crunch'
export const EXERCISE_NAMES = { squat: '深蹲', pushup: '俯卧撑', plank: '平板支撑', russian_twist: '俄罗斯转体', reverse_crunch: '反向卷腹' } as const
export type HoldStats = { heldMs:number; bestMs:number; breaks:number; timerMode?:'manual'|'auto'|'assisted' }

export type SquatSnapshot = {
  phase: SquatPhase
  repCount: number
  attemptCount: number
  averageKneeAngle: number | null
  averageElbowAngle?: number | null
  trackingReason?: string
  calibratedTopAngle?: number | null
  hold?: HoldStats
  hipDisplacement: number | null
  confidence: number
  feedback: string
  feedbackId?: number
  cue?: string
}
