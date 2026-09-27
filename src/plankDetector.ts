import type { Landmarks, Point, SquatSnapshot, HoldStats } from './types'
import type { RepRecord } from './coachDetector'
export const plankCues = {
  ready: '开始计时！稳住身体，保持自然呼吸。',
  breathe: '保持住，别憋气！稳稳呼吸，质量优先。',
  steady: '保持得不错！身体稳住，累了可以休息。',
  pause: '计时暂停。调整好姿势，再继续。',
  unclear: '请让肩、肘和前臂清晰入镜，不用拍到脚。手机靠近一些也可以。',
  sag: '髋部有些下沉了。调整身体位置，再继续保持。',
  pike: '髋部抬得有些高了。调整身体位置，找回平稳支撑。',
}
export class PlankDetector {
  constructor(readonly timerMode:'manual'|'auto'|'assisted'='auto') {}
  private startCandidate:number|null=null
  private userPaused=false
  private manualRunning=false
  private manualLast=0
  get running() {return this.manualRunning}
  tick(t=performance.now()) {
    if(this.timerMode!=='auto' && this.manualRunning) {
      const delta=Math.max(0,t-this.manualLast)
      this.stats.heldMs+=delta;this.continuous+=delta;this.stats.bestMs=Math.max(this.stats.bestMs,this.continuous)
      this.manualLast=Math.max(this.manualLast,t)
    }
    return {...this.stats,timerMode:this.timerMode}
  }
  setRunning(running:boolean,t=performance.now()) {
    this.tick(t)
    if(this.manualRunning && !running) {this.stats.breaks++;this.continuous=0}
    this.manualRunning=running;this.manualLast=t
    this.userPaused=!running;this.startCandidate=null
  }
  private stats: HoldStats={heldMs:0,bestMs:0,breaks:0}
  private last=0
  private readySince:number|null=null
  private pausedSince:number|null=null
  private active=false
  private continuous=0
  private previousValid=false
  private feedbackId=0
  private cue:keyof typeof plankCues|undefined
  private lastCue=0
  private bucket=0
  reset() {this.userPaused=false;this.startCandidate=null;this.manualRunning=false;this.manualLast=0;this.stats={heldMs:0,bestMs:0,breaks:0};this.last=0;this.readySince=null;this.pausedSince=null;this.active=false;this.continuous=0;this.previousValid=false;this.feedbackId=0;this.cue=undefined;this.lastCue=0;this.bucket=0}
  getStats() {return {repCount:0,attemptCount:0,records:[] as RepRecord[],hold:{...this.stats,timerMode:this.timerMode}}}
  private say(cue:keyof typeof plankCues,t:number) {if(cue!==this.cue || t-this.lastCue>12000){this.cue=cue;this.feedbackId++;this.lastCue=t}}
  update(l:Landmarks,t=performance.now(),width=1,height=1):SquatSnapshot {
    const good=(p:Point|undefined):p is Point=>!!p && p.visibility>=.4 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1
    const candidates=(['left','right'] as const).map(s=>[l[`${s}_shoulder`],l[`${s}_elbow`],l[`${s}_wrist`],l[`${s}_hip`],l[`${s}_knee`],l[`${s}_ankle`]])
      .filter(s=>s.slice(0,3).every(good)).sort((a,b)=>Math.min(...b.slice(0,3).map(p=>p!.visibility))-Math.min(...a.slice(0,3).map(p=>p!.visibility)))
    const side=candidates[0]
    const dt=this.last ? t-this.last : 0
    const gap=dt>700
    this.last=t
    let reason='未开始计时：请让肩、肘和手腕清晰入镜，不需要拍到脚。',valid=false,confidence=0
    let issue:keyof typeof plankCues='unclear'
    if(side) {
      const s=side[0]!,e=side[1]!,w=side[2]!,h=side[3],a=side[5]
      confidence=Math.min(s.visibility,e.visibility,w.visibility)
      const angle=(p:Point,q:Point,r:Point)=>{
        const ux=(p.x-q.x)*width,uy=(p.y-q.y)*height,vx=(r.x-q.x)*width,vy=(r.y-q.y)*height
        return Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy)||1))))*180/Math.PI
      }
      const armLength=Math.hypot((s.x-e.x)*width,(s.y-e.y)*height)
      const elbowAngle=angle(s,e,w)
      const upright=good(h) && (h.y-e.y)*height>armLength*.6 && Math.abs(h.x-s.x)*width<Math.abs(h.y-s.y)*height*.45
      if(armLength<Math.min(width,height)*.025) {reason='手臂在画面中过小，请把手机靠近一些。';issue='unclear'}
      else if((e.y-s.y)*height<armLength*.1 || elbowAngle<25 || elbowAngle>170 || upright) {reason='未开始计时：请让前臂支撑在肩的下方，准备好后自动计时。';issue='pause'}
      else {
        valid=true;reason='上半身支撑计时中；腰腿未完整观察。'
        // Optional full-body landmarks refine feedback, never gate the hold timer.
        if(good(h) && good(a)) {
          const dx=(a.x-s.x)*width,dy=(a.y-s.y)*height,length=Math.hypot(dx,dy)
          if(Math.abs(dx)>Math.abs(dy) && length>0) {
            const hipOffset=((h.y-s.y)*height-dy*((h.x-s.x)*width/dx))/length
            reason='保持支撑，正在累计时长。'
            if(hipOffset>.09) {reason=`${plankCues.sag} 计时继续。`;issue='sag'}
            else if(hipOffset<-.09) {reason=`${plankCues.pike} 计时继续。`;issue='pike'}
          }
        }
      }
    }
    if(this.timerMode==='assisted' && !this.manualRunning && !this.userPaused) {
      if(valid && !gap) {
        if(this.startCandidate===null) this.startCandidate=t
        if(t-this.startCandidate>=800) {this.setRunning(true,t);this.say('ready',t)}
      } else this.startCandidate=null
    }
    if(this.timerMode!=='auto') {
      const hold=this.tick(t)
      if(issue==='sag' || issue==='pike') this.say(issue,t)
      const bucket=Math.floor(hold.heldMs/15000)
      if(bucket>this.bucket){this.bucket=bucket;this.say('breathe',t)}
      return {phase:this.manualRunning ? 'STANDING':'WAITING',repCount:0,attemptCount:0,averageKneeAngle:null,hipDisplacement:null,confidence,
        feedback:this.manualRunning ? valid ? `计时继续。${reason.replace('计时中','可见')}` : `计时继续，姿态未确认。${reason.replace('未开始计时：','').replace('准备好后自动计时。','')}` : this.timerMode==='assisted' && !this.userPaused ? valid ? '已看到支撑，保持片刻后自动起表。' : reason : '已暂停；准备好后点“开始保持”继续。',feedbackId:this.feedbackId,cue:this.cue,hold}
    }
    if(!valid || gap) {
      if(this.pausedSince===null) this.pausedSince=gap ? t-dt : t
      if(t-this.pausedSince>=1500) this.readySince=null
      if(this.active && t-this.pausedSince>=1500) {this.stats.breaks++;this.active=false;this.continuous=0}
      this.previousValid=false
      this.say(gap ? 'pause' : issue,t)
      reason=gap ? '画面中断，暂停计时；保持姿势后自动继续。' : reason
    } else {
      if(this.pausedSince!==null && this.active && t-this.pausedSince>=1500) {this.stats.breaks++;this.active=false;this.continuous=0;this.readySince=null}
      this.pausedSince=null
      if(!this.active) {
        if(this.readySince===null) this.readySince=t
        if(t-this.readySince>=600) {this.active=true;this.say('ready',t)}
        else reason='已看到支撑姿势，保持片刻后开始计时。'
      } else if(this.previousValid) {
        this.stats.heldMs+=Math.max(0,dt);this.continuous+=Math.max(0,dt)
        this.stats.bestMs=Math.max(this.stats.bestMs,this.continuous)
        const bucket=Math.floor(this.stats.heldMs/15000)
        if(bucket>this.bucket){this.bucket=bucket;this.say(bucket%2 ? 'breathe' : 'steady',t)}
      }
      this.previousValid=true
      if(issue==='sag' || issue==='pike') this.say(issue,t)
    }
    return {phase:valid && this.active && !gap ? 'STANDING':'WAITING',repCount:0,attemptCount:0,averageKneeAngle:null,hipDisplacement:null,confidence,feedback:reason,feedbackId:this.feedbackId,cue:this.cue,hold:{...this.stats}}
  }
}
