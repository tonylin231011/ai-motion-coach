import type { Landmarks, Point, SquatSnapshot } from './types'
import type { RepRecord } from './coachDetector'

export const twistCues = {
  good: '这次转向看到了！稳住，再转向另一侧。',
  fast: '刚才换向有点快，慢一点，控制住身体。',
  unclear: '请正对镜头，让肩、髋和至少一只手清楚入镜。',
}

type Side = 'left' | 'right'

/** Counts alternating wrist travel relative to the hip, not trunk rotation quality. */
export class TwistDetector {
  private records:RepRecord[]=[]
  private side:Side|null=null
  private anchor:number|null=null
  private smooth:number|null=null
  private previous:number|null=null
  private direction=0
  private trend=0
  private outside=0
  private lastVisible=0
  private lastCount=0
  private scale=0
  private id=0
  private cue:keyof typeof twistCues|undefined

  private rearm() {this.anchor=null;this.smooth=null;this.previous=null;this.direction=0;this.trend=0;this.outside=0}
  reset() {this.records=[];this.side=null;this.rearm();this.lastVisible=0;this.lastCount=0;this.scale=0;this.id=0;this.cue=undefined}
  getStats() {return {repCount:this.records.length,attemptCount:this.records.length,records:this.records.map(r=>({...r}))}}

  update(l:Landmarks,t=performance.now(),width=1,height=1):SquatSnapshot {
    const usable=(p:Point|undefined):p is Point=>!!p && p.visibility>=.3 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1
    const options=(['left','right'] as const).map(side=>({side,wrist:l[`${side}_wrist`],hip:l[`${side}_hip`],shoulder:l[`${side}_shoulder`]}))
      .filter(s=>usable(s.wrist)&&usable(s.hip)&&usable(s.shoulder))
    let reason='',confidence=0,travel:number|null=null
    const chosen=options.find(s=>s.side===this.side) ?? (this.side===null || t-this.lastVisible>900
      ? options.sort((a,b)=>Math.min(b.wrist!.visibility,b.hip!.visibility,b.shoulder!.visibility)-Math.min(a.wrist!.visibility,a.hip!.visibility,a.shoulder!.visibility))[0]
      : undefined)
    if(!chosen) {
      this.trend=0;this.outside=0
      if(t-this.lastVisible>1200)this.rearm()
      reason=options.length ? '跟踪中的手暂时被挡住；请让手保持入镜。' : '未看到同一侧的手、肩和髋；请调整正面机位。'
    } else {
      if(chosen.side!==this.side || (this.lastVisible && t-this.lastVisible>1200)) this.rearm()
      this.side=chosen.side;this.lastVisible=t
      const shoulderSpan=usable(l.left_shoulder)&&usable(l.right_shoulder) ? Math.abs(l.left_shoulder.x-l.right_shoulder.x)*width : 0
      const torso=Math.hypot((chosen.shoulder!.x-chosen.hip!.x)*width,(chosen.shoulder!.y-chosen.hip!.y)*height)
      const measured=Math.max(shoulderSpan,torso*.55,width*.08)
      this.scale=this.scale ? Math.max(measured,this.scale*.995) : measured
      const raw=(chosen.wrist!.x-chosen.hip!.x)*width/this.scale
      confidence=Math.min(chosen.wrist!.visibility,chosen.hip!.visibility,chosen.shoulder!.visibility)
      this.smooth=this.smooth===null ? raw : this.smooth*.3+raw*.7
      this.anchor ??= this.smooth
      const delta=this.previous===null ? 0 : this.smooth-this.previous
      this.previous=this.smooth
      const sign=delta>.025 ? 1 : delta<-.025 ? -1 : 0
      this.trend=sign===0 ? Math.max(0,this.trend-1) : sign===Math.sign(this.trend) ? Math.max(-3,Math.min(3,this.trend+sign)) : sign
      travel=this.smooth-this.anchor
      const toward=Math.sign(travel)
      // Travel from the last counted position is essential: a stationary hand
      // cannot create repetitions as a learned centre or pose confidence drifts.
      const candidate=Math.abs(travel)>=.22 && toward!==this.direction
      this.outside=candidate ? this.outside+1 : 0
      const moving=candidate && Math.sign(this.trend)===toward && Math.abs(this.trend)>=2
      // At low frame rates a large move may appear in one frame. Confirm it
      // with the following frame before counting; a one-frame jump is ignored.
      if(moving || this.outside>=2) {
        const durationMs=this.lastCount ? t-this.lastCount : 0
        const fast=durationMs>0 && durationMs<450
        this.records.push({durationMs,minAngle:0,valid:true,issue:fast?'fast':null})
        this.cue=fast?'fast':'good';this.id++
        this.anchor=this.smooth;this.direction=toward;this.trend=0;this.outside=0;this.lastCount=t
        reason='已看到一次明确转向，继续向另一侧移动。'
      } else reason=`已跟踪${this.side==='left'?'左':'右'}手；距上次计数移动 ${Math.round(Math.abs(travel)*100)}%，继续向另一侧转。`
    }
    return {phase:!confidence?'WAITING':this.records.length?'ASCENDING':'STANDING',...this.getStats(),averageKneeAngle:null,hipDisplacement:travel,confidence,
      feedback:reason,trackingReason:reason,feedbackId:this.id,cue:this.cue}
  }
}
