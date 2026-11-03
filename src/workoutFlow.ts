import { SquatDetector, type RepRecord } from './coachDetector'
import { PushupDetector } from './pushupDetector'
import { PlankDetector } from './plankDetector'
import { WallSitDetector } from './wallSitDetector'
import { TwistDetector } from './twistDetector'
import { ReverseCrunchDetector } from './reverseCrunchDetector'
import { CurlDetector } from './curlDetector'
import type { Session } from './history'
import { isTimedExercise, type Exercise, type Landmarks, type SquatSnapshot } from './types'
import { poseFeedback, CueGate, type VisualFeedback } from './poseFeedback'
import type { TrainingPlan } from './workoutMetrics'

export type FlowStage = 'ready' | 'countdown' | 'active' | 'paused' | 'rest' | 'summary'
type Detector = SquatDetector | PushupDetector | PlankDetector | WallSitDetector | TwistDetector | ReverseCrunchDetector | CurlDetector
type Stats = Pick<Session, 'repCount' | 'attemptCount' | 'records' | 'hold' | 'wallSit' | 'armCounts'>
export type FlowView = { stage: FlowStage; group: number; countdown: number; remainingRest: number; snapshot: SquatSnapshot & {records: RepRecord[]}; feedback: VisualFeedback; elapsed: number; lastMiss: string; completed: number; revision: number }
const empty = (): SquatSnapshot => ({phase:'WAITING',repCount:0,attemptCount:0,averageKneeAngle:null,hipDisplacement:null,confidence:0,feedback:'摆好起始姿势，稳定后自动开始'})
function makeDetector(exercise: Exercise, target: number, manual=false): Detector {
  switch(exercise){case 'pushup':return new PushupDetector();case 'plank':return new PlankDetector('assisted');case 'wall_sit':return new WallSitDetector(manual?'manual':'assisted',target*1000);case 'russian_twist':return new TwistDetector();case 'reverse_crunch':return new ReverseCrunchDetector();case 'dumbbell_curl':return new CurlDetector();default:return new SquatDetector()}
}
export function mergeStats(parts: Stats[], exercise: Exercise, target: number): Stats {
  const merged: Stats={repCount:0,attemptCount:0,records:[]}
  for(const p of parts){merged.repCount+=p.repCount;merged.attemptCount+=p.attemptCount;merged.records.push(...p.records)}
  if(exercise==='dumbbell_curl') merged.armCounts={left:parts.reduce((n,p)=>n+(p.armCounts?.left??0),0),right:parts.reduce((n,p)=>n+(p.armCounts?.right??0),0)}
  if(isTimedExercise(exercise)) merged.hold={heldMs:parts.reduce((n,p)=>n+(p.hold?.heldMs??0),0),bestMs:Math.max(0,...parts.map(p=>p.hold?.bestMs??0)),breaks:parts.reduce((n,p)=>n+(p.hold?.breaks??0),0),timerMode:parts.find(p=>p.hold)?.hold?.timerMode??'assisted'}
  if(exercise==='wall_sit') {const sets=parts.flatMap(p=>p.wallSit?.sets??[]);merged.wallSit={targetMs:target*1000,sets,completedSets:sets.filter(s=>s.completed).length,currentMs:0};merged.repCount=merged.wallSit.completedSets;merged.attemptCount=sets.length}
  return merged
}

/** Flow/feedback wrapper only. Detector implementations and stored session schema stay unchanged. */
export class WorkoutFlow {
  stage: FlowStage='ready'
  readonly sessions: Session[]=[]
  revision=0
  private detector: Detector
  private preview: Detector
  private snapshot=empty()
  private gate=new CueGate()
  feedback: VisualFeedback={key:'ready',text:'摆好起始姿势，稳定后自动开始',severity:'neutral',joints:[],bodyVisible:false,ready:false,depth:null}
  private parts: Stats[]=[]
  private stableSince: number | null=null
  private readyAt=0
  private restUntil=0
  private absentSince: number | null=null
  private lastFrame=0
  private previousCenter: {x:number;y:number}|null=null
  private previousPoints: Landmarks|null=null
  private preparationFrames: {l:Landmarks;t:number;width:number;height:number}[]=[]
  private groupStart=0
  private groupId=''
  private hasStarted=false
  private lastRecordCount=0
  private miss='暂无未计动作'
  private manualCountdown=false
  private pauseReason='训练已暂停'
  private lastTick=0
  constructor(readonly exercise: Exercise, readonly plan: TrainingPlan, readonly timerOnly=false, private readonly wallNow=()=>Date.now(), private readonly id=()=>crypto.randomUUID()) {
    this.detector=makeDetector(exercise,plan.target,timerOnly);this.preview=makeDetector(exercise,plan.target,timerOnly)
  }
  private stats(){return mergeStats([...this.parts,this.detector.getStats()],this.exercise,this.plan.target)}
  private collect(t:number){
    if(this.detector instanceof PlankDetector)this.detector.setRunning(false,t)
    if(this.detector instanceof WallSitDetector)this.detector.finish(t)
    this.parts.push(this.detector.getStats());this.detector=makeDetector(this.exercise,this.plan.target,this.timerOnly)
  }
  pause(t:number,reason='训练已暂停，准备好后继续'){
    if(this.stage==='active'){this.collect(t);this.pauseReason=reason;this.stage='paused';this.miss='暂停前未完整完成的动作不补计'}
    else if(this.stage==='countdown'||this.stage==='ready'){this.stage='paused';this.pauseReason=reason}
    else return
    this.manualCountdown=false;this.stableSince=null;this.readyAt=0
  }
  resume(){if(this.stage!=='paused')return;this.stage='ready';this.preview=makeDetector(this.exercise,this.plan.target,this.timerOnly);this.previousCenter=null;this.previousPoints=null;this.preparationFrames=[];this.stableSince=null;this.absentSince=null}
  manualStart(t:number){if(this.stage==='ready'){this.stage='countdown';this.readyAt=t+3000;this.manualCountdown=true}}
  nextAfterRest(){if(this.stage!=='rest')return;this.stage='ready';this.preview=makeDetector(this.exercise,this.plan.target,this.timerOnly);this.stableSince=null;this.previousCenter=null;this.previousPoints=null;this.preparationFrames=[];this.absentSince=null;this.hasStarted=false;this.snapshot=empty()}
  private begin(t:number){
    this.detector=makeDetector(this.exercise,this.plan.target,this.timerOnly)
    // Use actual observed stable frames to retain standing calibration at "go".
    // Warm-up movement/counts are never imported from the preview detector.
    if(!isTimedExercise(this.exercise)){
      for(const frame of this.preparationFrames)this.detector.update(frame.l,frame.t,frame.width,frame.height)
      if(this.detector.getStats().attemptCount)this.detector=makeDetector(this.exercise,this.plan.target,this.timerOnly)
    }
    if(!this.hasStarted){this.groupStart=t;this.groupId=this.id();this.hasStarted=true}
    if(this.detector instanceof PlankDetector||this.detector instanceof WallSitDetector)this.detector.setRunning(true,t)
    this.stage='active';this.absentSince=null;this.lastFrame=t;this.lastRecordCount=this.stats().records.length
  }
  private closeGroup(t:number){
    if(!this.hasStarted)return
    this.collect(t)
    const stats=mergeStats(this.parts,this.exercise,this.plan.target)
    this.sessions.push({id:this.groupId,exercise:this.exercise,endedAt:this.wallNow(),durationMs:Math.max(0,t-this.groupStart),...stats,
      ...(this.exercise==='dumbbell_curl'?{curlCountUnit:'arm_reps' as const}:{}),...(this.exercise==='russian_twist'?{twistCountUnit:'sides' as const}:{}),...(!isTimedExercise(this.exercise)&&this.exercise!=='squat'?{countMode:'completed' as const}:{})})
    this.revision++;this.parts=[];this.hasStarted=false;this.lastRecordCount=0;this.miss='暂无未计动作'
  }
  finish(t:number){if(this.stage==='summary')return;this.closeGroup(t);this.stage='summary';this.revision++}
  private checkGoal(t:number){
    if(this.stage!=='active')return
    const stats=this.stats()
    const reached=this.exercise==='wall_sit'?stats.repCount>0:this.exercise==='plank'?(stats.hold?.heldMs??0)>=this.plan.target*1000:stats.repCount>=this.plan.target
    if(reached){this.closeGroup(t);if(this.sessions.length>=this.plan.sets)this.stage='summary';else{this.stage='rest';this.restUntil=t+this.plan.restSeconds*1000}}
  }
  tick(t:number){
    // A suspended page cannot silently accumulate a long static hold.
    if(this.lastTick && t-this.lastTick>1500 && this.stage==='active')this.pause(this.lastTick,'画面已中断，训练自动暂停')
    this.lastTick=t
    if(this.stage==='rest'&&t>=this.restUntil)this.nextAfterRest()
    if(this.stage==='countdown'&&t>=this.readyAt){
      if(this.manualCountdown||this.timerOnly||t-this.lastFrame<700)this.begin(t)
      else {this.stage='ready';this.stableSince=null}
    }
    if(this.stage==='active'){
      if(!this.timerOnly && ((this.absentSince!==null && t-this.absentSince>=3000)||t-this.lastFrame>=3000))this.pause(t,'未看到人体超过 3 秒，已自动暂停')
      else {if(this.detector instanceof PlankDetector||this.detector instanceof WallSitDetector)this.detector.tick(t);this.checkGoal(t)}
    }
    return this.view(t)
  }
  frame(l:Landmarks,t:number,width:number,height:number,luminance:number|null){
    this.lastFrame=t
    if(this.stage==='summary')return this.view(t)
    if(this.stage==='active')this.snapshot=this.detector.update(l,t,width,height)
    else if(this.stage==='ready'||this.stage==='countdown')this.snapshot=this.preview.update(l,t,width,height)
    const fresh=poseFeedback(this.exercise,l,this.snapshot,width,height,luminance)
    this.feedback=this.gate.update(fresh,t)
    if(fresh.bodyVisible)this.absentSince=null
    else this.absentSince??=t
    if(this.stage==='ready'||this.stage==='countdown'){
      const points=Object.values(l).filter(p=>p.visibility>.65)
      const center=points.length?{x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length}:null
      const movement=this.previousPoints?Object.entries(l).some(([key,p])=>{const old=this.previousPoints![key as keyof Landmarks];return old&&old.visibility>.65&&p.visibility>.65&&Math.hypot(p.x-old.x,p.y-old.y)>.035}):true
      const stable=center&&this.previousCenter&&!movement&&Math.hypot(center.x-this.previousCenter.x,center.y-this.previousCenter.y)<.035
      this.previousCenter=center
      this.previousPoints=l
      if(fresh.ready&&stable){this.preparationFrames.push({l,t,width,height});this.preparationFrames=this.preparationFrames.filter(f=>t-f.t<=900)}else this.preparationFrames=[]
      if(fresh.ready&&stable){this.stableSince??=t;if(this.stage==='ready'&&t-this.stableSince>=1200){this.stage='countdown';this.readyAt=t+3000;this.manualCountdown=false}}
      else if(!this.manualCountdown){this.stableSince=null;if(this.stage==='countdown')this.stage='ready'}
    }
    if(this.stage==='active'){
      const records=this.stats().records
      if(records.length>this.lastRecordCount){const last=records.at(-1)!;if(!last.valid&&this.exercise==='squat')this.miss='最近未计：深度不足';this.lastRecordCount=records.length}
      if(this.snapshot.cue==='unclear'||this.snapshot.cue==='incomplete')this.miss='最近未计：动作未完整观察'
      this.checkGoal(t)
    }
    return this.tick(t)
  }
  view(t:number):FlowView {
    const stats=this.stats()
    const snapshot={...this.snapshot,...stats}
    const feedback=this.stage==='paused'?{...this.feedback,key:'paused',text:this.pauseReason,severity:'stop' as const}:this.feedback
    return {stage:this.stage,group:Math.min(this.plan.sets,this.sessions.length+1),countdown:Math.max(1,Math.ceil((this.readyAt-t)/1000)),remainingRest:Math.max(0,Math.ceil((this.restUntil-t)/1000)),snapshot,feedback,elapsed:this.hasStarted?Math.max(0,t-this.groupStart):0,lastMiss:this.miss,completed:this.sessions.length,revision:this.revision}
  }
  latestRecords():RepRecord[]{return this.stats().records}
  get currentId(){return this.groupId}
}

