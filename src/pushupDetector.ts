import type { RepRecord } from './coachDetector'
import type { Landmarks, Point, SquatSnapshot } from './types'
export const pushupCues = {
  good1: '漂亮！这次下放和推起都完成了，继续保持！',
  good2: '好！推回来了，稳住身体，认真完成下一次！',
  good3: '这次幅度不错！控制住下放，继续！',
  shallow: '这次下放幅度偏小。下一次在舒适范围内把动作做完整！',
  fast: '稳住！这次有点快，控制下放，再把身体推起！',
  fading: '最近两次下放变浅了。保持质量，累了就先休息！',
  rushing: '节奏开始加快了！找回控制，别急着赶次数！',
  improved: '对，这次调整回来了！保持这个质量！',
  milestone: '又完成五次！稳住身体，继续保持专注！',
  unclear: '请让肩、肘和手腕清晰入镜，正面或侧面都可以，不用拍到脚。',
  incomplete: '先回到高位支撑，再开始下一次。需要时可以休息。',
}
/** Upper-body motion counter. Completed cycles are separate from range assessment. */
export class PushupDetector {
  private phase: SquatSnapshot['phase'] = 'WAITING'
  private records: RepRecord[] = []
  private attempts = 0
  private top: number | null = null
  private side: string | null = null
  private lastSeen = 0
  private angle: number | null = null
  private started = 0
  private minimum = 180
  private lowFrames = 0
  private topSince = 0
  private feedbackId = 0
  private cue: keyof typeof pushupCues | undefined
  private topHeight = 0
  private minimumHeight = 0
  private armLength = 0
  private wrist: {x:number;y:number} | null = null
  private descentFrames = 0
  private restart() {
    this.phase='WAITING'; this.top=null; this.angle=null
    this.started=0; this.lowFrames=0; this.topSince=0
    this.topHeight=0;this.minimumHeight=0;this.armLength=0;this.wrist=null;this.descentFrames=0
  }
  reset() { this.restart(); this.records=[]; this.attempts=0; this.side=null; this.lastSeen=0; this.feedbackId=0; this.cue=undefined }
  getStats() { return { repCount:this.records.length, attemptCount:this.attempts, records:this.records.map(r=>({...r})) } }
  private snapshot(confidence:number, reason:string):SquatSnapshot {
    return {phase:this.phase,repCount:this.records.length,attemptCount:this.attempts,averageKneeAngle:null,averageElbowAngle:this.angle,hipDisplacement:null,confidence,
      feedback:reason || (this.cue ? pushupCues[this.cue] : '已看到上半身，正常下压再推回即可计数。'),feedbackId:this.feedbackId,cue:this.cue,
      trackingReason:reason || '正在识别动作', calibratedTopAngle:this.top}
  }
  update(landmarks: Landmarks, timestamp=performance.now(), width=1, height=1): SquatSnapshot {
    const usable = (p: Point | undefined): p is Point => !!p && p.visibility>=.5 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1
    const candidates = (['left','right'] as const).map(side=>({
      name:side,
      shoulder:landmarks[`${side}_shoulder`], elbow:landmarks[`${side}_elbow`], wrist:landmarks[`${side}_wrist`], hip:landmarks[`${side}_hip`], ankle:landmarks[`${side}_ankle`],
    })).filter(s=>usable(s.shoulder)&&usable(s.elbow)&&usable(s.wrist))
    const score=(s:typeof candidates[number])=>Math.min(s.shoulder!.visibility,s.elbow!.visibility,s.wrist!.visibility)
    candidates.sort((a,b)=>score(b)-score(a))
    const valid=candidates.filter(s=>s.wrist!.y>s.shoulder!.y)
    const side=valid.find(s=>s.name===this.side) ?? valid[0]
    if(!side) {
      this.topSince=0;this.lowFrames=0
      if(timestamp-this.lastSeen>900) this.restart()
      return this.snapshot(0, !candidates.length ? '肩、肘或手腕不清晰，请靠近一些；不需要拍到脚。' : '请让肩和支撑的手同时入镜，手机保持固定。')
    }
    if((this.side && side.name!==this.side) || (this.lastSeen && timestamp-this.lastSeen>900)) this.restart()
    this.side=side.name;this.lastSeen=timestamp
    const a=side.shoulder!,b=side.elbow!,c=side.wrist!
    const ax=(a.x-b.x)*width,ay=(a.y-b.y)*height,cx=(c.x-b.x)*width,cy=(c.y-b.y)*height
    const length=Math.hypot(ax,ay)*Math.hypot(cx,cy)
    if(length<1e-8) {this.restart();return this.snapshot(0,'未计数：手臂关键点重叠，请调整侧面机位。')}
    const raw=Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy)/length)))*180/Math.PI
    this.angle=this.angle===null ? raw : .7*raw+.3*this.angle
    const angle=this.angle, confidence=score(side)
    const arm=Math.hypot(ax,ay)+Math.hypot(cx,cy)
    const heightAboveHand=(c.y-a.y)*height
    if(this.top===null) {
      this.top=angle;this.topHeight=heightAboveHand;this.armLength=arm;this.wrist={x:c.x*width,y:c.y*height};this.phase='STANDING'
      return this.snapshot(confidence,'已看到手臂，正常下压再推回；无需停顿校准。')
    }
    if(this.wrist && Math.hypot(c.x*width-this.wrist.x,c.y*height-this.wrist.y)>this.armLength*.25) {
      this.restart();return this.snapshot(confidence,'支撑手或镜头位置变化，已重新准备；请保持手机和支撑手稳定。')
    }
    if(this.phase==='STANDING') {
      this.top=Math.max(this.top,angle);this.topHeight=Math.max(this.topHeight,heightAboveHand)
      const lowering=angle<this.top-15 || this.topHeight-heightAboveHand>this.armLength*.12
      this.descentFrames=lowering ? this.descentFrames+1 : 0
      if(this.descentFrames>=2) {
        this.phase='DESCENDING';this.started=timestamp;this.minimum=angle;this.minimumHeight=heightAboveHand;this.lowFrames=0;this.attempts++
      }
    }
    if(this.started) {
      this.minimum=Math.min(this.minimum,angle)
      this.minimumHeight=Math.min(this.minimumHeight,heightAboveHand)
      if(angle<Math.min(115,this.top-30)) {this.lowFrames++;this.phase='BOTTOM'}
      const angleTravel=this.top-this.minimum, shoulderTravel=this.topHeight-this.minimumHeight
      const armReturn=angleTravel>=15 && angle>=this.top-Math.max(8,angleTravel*.25)
      const shoulderReturn=shoulderTravel>=this.armLength*.12 && heightAboveHand>=this.topHeight-shoulderTravel*.25
      if(angle>this.minimum+8 || heightAboveHand>this.minimumHeight+this.armLength*.05) this.phase='ASCENDING'
      if(armReturn || shoulderReturn) {if(!this.topSince) this.topSince=timestamp} else this.topSince=0
      if(this.topSince && timestamp-this.topSince>=100) {
        const durationMs=timestamp-this.started,valid=this.lowFrames>=2 || shoulderTravel>=this.armLength*.25
        if(durationMs<350) {this.started=0;this.topSince=0;this.phase='STANDING';return this.snapshot(confidence,'幅度变化太短，继续保持稳定动作。')}
        const issue=!valid ? 'shallow' : durationMs<1200 ? 'fast' : null
        const previous=this.records.at(-1)
        this.records.push({durationMs,minAngle:this.minimum,valid,issue})
        const baseline=this.records.slice(0,3),recent=this.records.slice(-2)
        const baselineAngle=baseline.reduce((n,r)=>n+r.minAngle,0)/baseline.length
        const baselineDuration=baseline.reduce((n,r)=>n+r.durationMs,0)/baseline.length
        const count=this.records.filter(r=>r.valid).length
        this.cue=issue ?? (this.records.length>=5 && recent.every(r=>r.minAngle>baselineAngle+12) ? 'fading'
          : this.records.length>=5 && recent.every(r=>r.durationMs<baselineDuration*.75) ? 'rushing'
          : previous?.issue ? 'improved' : count%5===0 ? 'milestone' : (['good1','good2','good3'] as const)[(count-1)%3])
        this.feedbackId++
        this.started=0;this.topSince=0;this.descentFrames=0;this.phase='STANDING'
      } else if(timestamp-this.started>15000) {
        this.restart();this.cue='incomplete';this.feedbackId++
        return this.snapshot(confidence,pushupCues.incomplete)
      }
    }
    return this.snapshot(confidence,'')
  }
}
