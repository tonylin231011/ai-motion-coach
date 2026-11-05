import type { Exercise, Landmarks, Point, SquatSnapshot } from './types'

export type PoseDot = { x: number; y: number; visibility?: number }
export type VisualFeedback = { key: string; text: string; severity: 'neutral' | 'good' | 'caution' | 'stop'; joints: number[]; bodyVisible: boolean; ready: boolean; depth: number | null }
const good = (p: Point | undefined): p is Point => !!p && p.visibility >= .65 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > .015 && p.x < .985 && p.y > .015 && p.y < .985
const angle = (a: Point, b: Point, c: Point, w: number, h: number) => {
  const ux=(a.x-b.x)*w, uy=(a.y-b.y)*h, vx=(c.x-b.x)*w, vy=(c.y-b.y)*h
  const d=Math.hypot(ux,uy)*Math.hypot(vx,vy)
  return d ? Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/d)))*180/Math.PI : 0
}
// UI-only observations. These thresholds never alter detector counts or mark medical danger.
export function poseFeedback(exercise: Exercise, l: Landmarks, snapshot: SquatSnapshot, width: number, height: number, luminance: number | null): VisualFeedback {
  const points=Object.values(l).filter(p=>p && p.visibility>=.4)
  const bodyVisible=points.length>=3
  const result: VisualFeedback={key:'observe',text:'保持可控节奏，按舒适范围完成',severity:bodyVisible?'good':'neutral',joints:[],bodyVisible,ready:false,depth:null}
  if (!['squat','pushup','plank','wall_sit'].includes(exercise) && luminance !== null && luminance < 32) return {...result,key:'dark',text:'画面偏暗，请开灯或面向光源',severity:'caution'}
  if (!bodyVisible) return {...result,key:'no-person',text:'没有看到人，请站进画面'}
  const sides=(['left','right'] as const).map((s,i)=>({i,shoulder:l[`${s}_shoulder`],hip:l[`${s}_hip`],knee:l[`${s}_knee`],ankle:l[`${s}_ankle`],elbow:l[`${s}_elbow`],wrist:l[`${s}_wrist`]}))
  if (exercise==='squat' || exercise==='wall_sit') {
    // Squat readiness uses the detector's actual in-frame bounds, not an extra margin or whole-body gate.
    const legVisible=exercise==='squat'?(p:Point|undefined)=>!!p&&p.visibility>=.65&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1:good
    const side=sides.find(s=>[s.hip,s.knee,s.ankle].every(legVisible))
    if(!side) return {...result,key:'legs-cropped',text:'可随时点击开始；当前可见部位不足以判断动作幅度',severity:'caution',joints:[25,26,27,28]}
    const kneeAngle=angle(side.hip!,side.knee!,side.ankle!,width,height)
    result.ready=exercise==='squat' ? kneeAngle>158 : snapshot.phase==='STANDING'
    result.depth=exercise==='squat' ? Math.max(0,Math.min(1,(180-kneeAngle)/100)) : null
    // Frontal-only relative knee/ankle spacing; side view cannot evaluate valgus.
    const both=sides.every(s=>[s.shoulder,s.hip,s.knee,s.ankle].every(good))
    if(exercise==='squat' && both && kneeAngle<150) {
      const shoulderSpan=Math.abs(l.left_shoulder!.x-l.right_shoulder!.x)*width
      const torsoLength=Math.abs(side.hip!.y-side.shoulder!.y)*height
      const feet=Math.abs(l.left_ankle!.x-l.right_ankle!.x)*width
      const knees=Math.abs(l.left_knee!.x-l.right_knee!.x)*width
      if(shoulderSpan>torsoLength*.65 && feet>width*.12 && knees<feet*.6) return {...result,key:'knees-in',text:'正面观察到膝盖向内靠拢，请让膝盖顺着脚尖',severity:'caution',joints:[25,26]}
    }
    if(exercise==='squat' && good(side.shoulder) && kneeAngle<150) {
      const torsoY=(side.hip!.y-side.shoulder.y)*height
      const lean=Math.atan2(Math.abs(side.hip!.x-side.shoulder.x)*width,Math.max(1,torsoY))*180/Math.PI
      if(lean>60 && torsoY>height*.06) return {...result,key:'lean',text:'躯干前倾较大，先减小幅度、稳住身体',severity:'caution',joints:[11+side.i,23+side.i]}
    }
  } else if (exercise==='russian_twist') {
    const usable=(p:Point|undefined):p is Point=>!!p&&p.visibility>=.3&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1
    result.ready=sides.some(s=>[s.shoulder,s.hip,s.wrist].every(usable))&&snapshot.confidence>0
    if(!result.ready)return {...result,key:'twist-framing',text:'请正对镜头，拍清肩、髋和至少一只手；不需要拍到脚',severity:'neutral'}
  } else if (exercise==='dumbbell_curl') {
    result.ready=sides.some(s=>[s.shoulder,s.elbow,s.wrist].every(good) && angle(s.shoulder!,s.elbow!,s.wrist!,width,height)>145)
  } else result.ready=snapshot.confidence>0 && snapshot.phase==='STANDING'
  if(snapshot.cue==='shallow') return {...result,key:'shallow',text:exercise==='squat'?'这次深度不足，下次在舒适范围内下蹲':'这次幅度偏小，下次控制完整回程',severity:'caution',joints:exercise==='squat'?[25,26]:[13,14]}
  if(snapshot.cue==='fast') return {...result,key:'fast',text:'节奏有些快，放慢回程、保持控制',severity:'caution'}
  if(snapshot.cue==='sag' || snapshot.cue==='pike') return {...result,key:snapshot.cue,text:snapshot.cue==='sag'?'髋部有些下沉，调整到平稳支撑':'髋部抬得较高，调整到平稳支撑',severity:'caution',joints:[23,24]}
  if(snapshot.confidence===0 && !result.ready) return {...result,key:'keypoints',text:['squat','pushup','plank','wall_sit'].includes(exercise)?'可随时点击开始；暂未观察到完整动作周期':exercise==='reverse_crunch'?'请侧拍肩、髋和膝，先把腿放远':'请拍清肩、肘和手腕，摆好起始姿势',severity:'neutral'}
  return result
}

export const CONNECTIONS: Array<[number,number]>=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]]
export function drawSkeleton(ctx: CanvasRenderingContext2D, points: PoseDot[], width: number, height: number, feedback: VisualFeedback) {
  ctx.clearRect(0,0,width,height)
  ctx.lineCap='round';ctx.lineJoin='round'
  const color=feedback.severity==='stop'?'#E5483A':feedback.severity==='caution'?'#FFB020':feedback.severity==='good'?'#0E8F47':'#d5ddd7'
  for(const [a,b] of CONNECTIONS) {
    const p=points[a],q=points[b];if(!p||!q||(p.visibility??1)<.45||(q.visibility??1)<.45)continue
    ctx.beginPath();ctx.moveTo(p.x*width,p.y*height);ctx.lineTo(q.x*width,q.y*height)
    ctx.strokeStyle='rgba(0,15,10,.65)';ctx.lineWidth=Math.max(7,width/100);ctx.stroke()
    ctx.strokeStyle=feedback.joints.length && !feedback.joints.includes(a) && !feedback.joints.includes(b)?'#0E8F47':color
    ctx.lineWidth=Math.max(3,width/210);ctx.stroke()
  }
  const joint=feedback.joints.map(i=>points[i]).find(p=>p&&(p.visibility??1)>=.65)
  if(joint&&feedback.severity==='caution'){
    const x=joint.x*width,y=joint.y*height,dx=x<width/2?45:-45;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,Math.min(height-12,y+35));ctx.strokeStyle='#FFB020';ctx.lineWidth=2;ctx.stroke()
  }
  for(let i=0;i<points.length;i++) {
    const p=points[i];if((p.visibility??1)<.45)continue
    ctx.beginPath();ctx.arc(p.x*width,p.y*height,Math.max(3,width/180),0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill()
    if(feedback.joints.includes(i)){ctx.setLineDash([]);ctx.beginPath();ctx.arc(p.x*width,p.y*height,Math.max(12,width/45),0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.stroke();ctx.setLineDash([])}
  }
}

export class CueGate {
  private shown: VisualFeedback | null=null
  private at=-Infinity
  private candidate=''
  private since=0
  update(next: VisualFeedback, t: number) {
    if(next.key!==this.candidate){this.candidate=next.key;this.since=t}
    if(!this.shown || (next.key!==this.shown.key && t-this.at>=3000 && t-this.since>=450) || next.severity==='stop') {this.shown=next;this.at=t}
    return {...this.shown!,bodyVisible:next.bodyVisible,ready:next.ready,depth:next.depth}
  }
}
