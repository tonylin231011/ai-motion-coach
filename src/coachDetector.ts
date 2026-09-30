import type { Landmarks, Point, SquatPhase, SquatSnapshot } from './types'
export const cues = {
  good1: '漂亮！这次幅度到位，也站回来了。保持这个质量！',
  good2: '好！这一遍有控制。稳住，继续拿下下一次！',
  good3: '做得好！幅度和节奏都保持住了，继续！',
  shallow: '这次幅度偏小。下一次把动作做完整，在舒适范围内下蹲！',
  fast: '先稳住！这次太快了。下一次慢慢下，控制着起身！',
  fading: '注意，最近两次比前面蹲得浅了。稳住质量，累了可以休息！',
  rushing: '节奏开始加快了！别赶次数，找回前面的控制！',
  improved: '对，就是这样！这次把刚才的问题调整回来了，很好！',
  milestone: '又完成五次！保持专注，下一次也要有质量！',
  unclear: '刚才没看清，这次先不评价。调整一下位置吧。',
  incomplete: '先回到站立，再开始下一次，不着急。',
}
export type RepRecord = { durationMs: number; minAngle: number; valid: boolean; issue: 'shallow' | 'fast' | null; side?: 'left' | 'right' }
/** Estimates visible range and tempo only, not full form or medical safety. */
export class SquatDetector {
  private phase: SquatPhase = 'WAITING'
  private repCount = 0
  private attemptCount = 0
  private standingHipY: number | null = null
  private smoothed: number | null = null
  private started = 0
  private minimum = 180
  private standingSince = 0
  private feedbackId = 0
  private cue: keyof typeof cues | undefined
  private records: RepRecord[] = []
  private topSince = 0
  private bottomSince = 0
  private reachedBottom = false
  getStats() { return { repCount: this.repCount, attemptCount: this.attemptCount, records: this.records.map(r => ({...r})) } }
  reset() {
    this.phase = 'WAITING'; this.repCount = 0; this.attemptCount = 0
    this.standingHipY = null; this.smoothed = null; this.started = 0
    this.standingSince = 0; this.minimum = 180; this.feedbackId = 0; this.cue = undefined
    this.records = []
    this.topSince=0; this.bottomSince=0; this.reachedBottom=false
  }
  update(landmarks: Landmarks, timestamp = performance.now(), width = 1, height = 1): SquatSnapshot {
    const sides = [[landmarks.left_hip,landmarks.left_knee,landmarks.left_ankle],[landmarks.right_hip,landmarks.right_knee,landmarks.right_ankle]]
    const valid = sides.filter((side): side is Point[] => side.every(p => p && p.visibility >= .65 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1))
    const angles = valid.map(([a,b,c]) => {
      const ax=(a.x-b.x)*width, ay=(a.y-b.y)*height, cx=(c.x-b.x)*width, cy=(c.y-b.y)*height
      const d=Math.hypot(ax,ay)*Math.hypot(cx,cy)
      return d>0 ? Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy)/d)))*180/Math.PI : NaN
    }).filter(Number.isFinite)
    if (!angles.length) {
      if(this.started) this.feedback('unclear')
      this.phase='WAITING'; this.started=0; this.smoothed=null; this.standingSince=0; this.standingHipY=null
      this.topSince=0; this.bottomSince=0; this.reachedBottom=false
      return this.snapshot(null,null,0,'请让髋、膝盖和脚都进入画面')
    }
    const raw=angles.reduce((a,b)=>a+b,0)/angles.length
    this.smoothed=this.smoothed===null ? raw : .65*raw+.35*this.smoothed
    const angle=this.smoothed, hip=valid.reduce((sum,side)=>sum+side[0].y,0)/valid.length
    const confidence=Math.min(...valid.flat().map(p=>p.visibility))
    if(this.phase==='WAITING' && angle>158) {
      if(!this.standingSince) this.standingSince=timestamp
      if(timestamp-this.standingSince>=300) {this.phase='STANDING';this.standingHipY=hip}
    } else if(this.phase==='WAITING') this.standingSince=0
    if(this.phase==='STANDING' && angle<145) {
      this.phase='DESCENDING';this.started=timestamp;this.minimum=angle;this.attemptCount++
      this.topSince=0; this.bottomSince=0; this.reachedBottom=false
    }
    if(this.started) {
      this.minimum=Math.min(this.minimum,angle)
      if(angle<108) {
        this.phase='BOTTOM'
        if(!this.bottomSince) this.bottomSince=timestamp
        if(timestamp-this.bottomSince>=100) this.reachedBottom=true
      } else this.bottomSince=0
      if(this.minimum<108 && angle>116) this.phase='ASCENDING'
      if(angle>158) { if(!this.topSince) this.topSince=timestamp } else this.topSince=0
      if(this.topSince && timestamp-this.topSince>=200) {
        const durationMs = timestamp-this.started
        const valid = this.reachedBottom
        const issue = !valid ? 'shallow' : durationMs < 1500 ? 'fast' : null
        const previous = this.records.at(-1)
        this.records.push({durationMs, minAngle:this.minimum, valid, issue})
        if(valid) this.repCount++
        const first = this.records.slice(0,3)
        const last = this.records.slice(-2)
        const baselineAngle = first.reduce((s,r)=>s+r.minAngle,0)/first.length
        const baselineDuration = first.reduce((s,r)=>s+r.durationMs,0)/first.length
        if(issue) this.feedback(issue)
        else if(this.records.length>=5 && last.every(r=>r.minAngle>baselineAngle+12)) this.feedback('fading')
        else if(this.records.length>=5 && last.every(r=>r.durationMs<baselineDuration*.75)) this.feedback('rushing')
        else if(previous?.issue) this.feedback('improved')
        else this.feedback(this.repCount%5===0 ? 'milestone' : (['good1','good2','good3'] as const)[(this.repCount-1)%3])
        this.started=0;this.phase='STANDING';this.standingHipY=hip
      } else if(timestamp-this.started>15000) {
        this.feedback('incomplete');this.started=0;this.phase='WAITING';this.standingSince=0
      }
    }
    return this.snapshot(angle,this.standingHipY===null ? null : hip-this.standingHipY,confidence,this.cue ? cues[this.cue] : '侧身入镜，先站稳，再按舒适的范围慢慢下蹲')
  }
  private feedback(cue: keyof typeof cues) {this.cue=cue;this.feedbackId++}
  private snapshot(averageKneeAngle:number|null,hipDisplacement:number|null,confidence:number,feedback:string):SquatSnapshot {
    return {phase:this.phase,repCount:this.repCount,attemptCount:this.attemptCount,averageKneeAngle,hipDisplacement,confidence,feedback,feedbackId:this.feedbackId,cue:this.cue}
  }
}
