import type { Landmarks, Point, SquatSnapshot } from './types'
import type { RepRecord } from './coachDetector'

export const reverseCrunchCues = {
  good: '收膝和放回都看到了，继续稳稳地做！',
  fast: '这一遍有点快，放下时慢一点。',
  unclear: '请侧面拍，让肩、髋和至少一侧膝盖清楚入镜。',
}

// Counts visible knee-to-torso tuck and return; pelvic lift is not certified.
export class ReverseCrunchDetector {
  private records:RepRecord[]=[]
  private attempts=0
  private phase:SquatSnapshot['phase']='WAITING'
  private far=0
  private near=Infinity
  private started=0
  private lastVisible=0
  private lowFrames=0
  private highFrames=0
  private id=0
  private cue:keyof typeof reverseCrunchCues|undefined
  private resetMotion(){this.phase='WAITING';this.far=0;this.near=Infinity;this.started=0;this.lowFrames=0;this.highFrames=0}
  reset(){this.records=[];this.attempts=0;this.lastVisible=0;this.id=0;this.cue=undefined;this.resetMotion()}
  getStats(){return {repCount:this.records.length,attemptCount:this.attempts,records:this.records.map(r=>({...r}))}}
  update(l:Landmarks,t=performance.now(),width=1,height=1):SquatSnapshot {
    const usable=(p:Point|undefined):p is Point=>!!p && p.visibility>=.4 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1
    const sides=(['left','right'] as const).map(side=>({shoulder:l[`${side}_shoulder`],hip:l[`${side}_hip`],knee:l[`${side}_knee`]}))
      .filter(s=>usable(s.shoulder)&&usable(s.hip)&&usable(s.knee))
    let ratio:number|null=null,confidence=0,reason=''
    if(!sides.length){if(t-this.lastVisible>1200)this.resetMotion();reason=reverseCrunchCues.unclear}
    else {
      if(this.lastVisible && t-this.lastVisible>1200)this.resetMotion()
      this.lastVisible=t
      const s=sides.sort((a,b)=>Math.min(b.shoulder!.visibility,b.hip!.visibility,b.knee!.visibility)-Math.min(a.shoulder!.visibility,a.hip!.visibility,a.knee!.visibility))[0]
      const sh=s.shoulder!,hip=s.hip!,knee=s.knee!
      const torso=Math.hypot((sh.x-hip.x)*width,(sh.y-hip.y)*height)
      ratio=torso>width*.04 ? Math.hypot((sh.x-knee.x)*width,(sh.y-knee.y)*height)/torso:null
      confidence=Math.min(sh.visibility,hip.visibility,knee.visibility)
      if(ratio===null){reason='肩和髋太接近，请调整侧面机位。'}
      else if(this.phase==='WAITING'){
        this.far=Math.max(this.far,ratio)
        if(ratio>=1.35){this.phase='STANDING';reason='已看到腿放远，接下来缓慢收膝。'}
        else reason='先把腿放远一些，让肩、髋、膝清楚入镜。'
      } else if(this.phase==='STANDING'){
        this.far=Math.max(this.far,ratio)
        const tucked=ratio<=Math.max(.82,this.far*.76)
        this.lowFrames=tucked?this.lowFrames+1:0
        if(this.lowFrames>=2){this.phase='BOTTOM';this.started=t;this.near=ratio;this.attempts++;this.highFrames=0;reason='收膝已看到，慢慢把腿放回。'}
        else reason='腿放远后再收向胸前。'
      } else {
        this.near=Math.min(this.near,ratio)
        const returned=ratio>=Math.max(1.15,this.far*.86)
        this.highFrames=returned?this.highFrames+1:0
        if(this.highFrames>=2){
          const durationMs=t-this.started,fast=durationMs<600
          this.records.push({durationMs,minAngle:this.near,valid:true,issue:fast?'fast':null})
          this.cue=fast?'fast':'good';this.id++;this.phase='STANDING';this.lowFrames=0;this.highFrames=0
          reason='完成一次，控制着开始下一次。'
        } else if(t-this.started>10000){this.phase='STANDING';this.lowFrames=0;reason='这次未看到放回，重新伸腿后再收膝。'}
        else reason='已看到收膝，慢慢放回。'
      }
    }
    return {phase:this.phase,...this.getStats(),averageKneeAngle:null,hipDisplacement:ratio,confidence,feedback:reason,trackingReason:reason,feedbackId:this.id,cue:this.cue}
  }
}
