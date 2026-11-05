import type { Exercise } from './types'
import type { PoseDot } from './poseFeedback'
export type Deviation = '塌腰' | '臀部过高' | '蹲得不够低' | '蹲得过深'
export type PostureReport = { totalMs:number; goodMs:number; bestMs:number; frames:number; visibleFrames:number; issues:Partial<Record<Deviation,{ms:number;firstMs:number}>> }
export const compactTime=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`
const visible=(p:PoseDot|undefined):p is PoseDot=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??0)>.5&&p.x>.01&&p.x<.99&&p.y>.01&&p.y<.99
export function posture(points:PoseDot[],exercise:Exercise,w:number,h:number){
  const side=[ [11,23,25,27], [12,24,26,28] ].find(ids=>ids.every(i=>visible(points[i])))
  if(!visible(points[0])||!side)return {visible:false,issue:null}
  const [s,hip,k,a]=side.map(i=>({x:points[i].x*w,y:points[i].y*h}))
  const angle=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>{const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};return Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)||1))))*180/Math.PI}
  let issue:Deviation|null=null
  if(exercise==='plank'&&angle(s,hip,a)<165){const lineY=s.y+(a.y-s.y)*(hip.x-s.x)/(a.x-s.x||1);issue=hip.y>lineY?'塌腰':'臀部过高'}
  if(exercise==='wall_sit'){const knee=angle(hip,k,a);issue=knee>100?'蹲得不够低':knee<80?'蹲得过深':null}
  return {visible:true,issue}
}
export class TimedPosture {
  report:PostureReport={totalMs:0,goodMs:0,bestMs:0,frames:0,visibleFrames:0,issues:{}}
  private previous=0;private streak=0;private pending=0;private candidate:Deviation|null=null
  sample(heldMs:number,observation:{visible:boolean;issue:Deviation|null}){
    const dt=Math.max(0,heldMs-this.previous);this.previous=heldMs;this.report.totalMs=heldMs
    this.report.frames++;if(observation.visible)this.report.visibleFrames++
    if(!observation.visible||dt>1000){this.streak=0;this.pending=0;this.candidate=null;return}
    if(!observation.issue){this.pending=0;this.candidate=null;this.streak+=dt;this.report.goodMs+=dt;this.report.bestMs=Math.max(this.report.bestMs,this.streak);return}
    this.streak=0
    if(observation.issue!==this.candidate){this.candidate=observation.issue;this.pending=0}
    const old=this.pending;this.pending+=dt
    if(this.pending>500){const issue=this.report.issues[observation.issue]??={ms:0,firstMs:Math.max(0,heldMs-this.pending)};issue.ms+=old<=500?this.pending:dt}
  }
  pause(){this.streak=0;this.pending=0;this.candidate=null}
}
const key=(id:string)=>`motion-coach.posture.v1:${id}`
export function savePosture(id:string,report:PostureReport){localStorage.setItem(key(id),JSON.stringify(report))}
export function readPosture(id:string):PostureReport|null{try{const r=JSON.parse(localStorage.getItem(key(id))??'null');return r&&[r.totalMs,r.goodMs,r.bestMs,r.frames,r.visibleFrames].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)&&r.goodMs<=r.totalMs&&r.visibleFrames<=r.frames&&r.issues&&typeof r.issues==='object'?r:null}catch{return null}}
export function postureSummary(ids:string[],totalMs:number){
 const reports=ids.map(readPosture).filter((r):r is PostureReport=>!!r),frames=reports.reduce((n,r)=>n+r.frames,0),visible=reports.reduce((n,r)=>n+r.visibleFrames,0)
 const covered=reports.reduce((n,r)=>n+r.totalMs,0),good=Math.min(totalMs,reports.reduce((n,r)=>n+r.goodMs,0)),best=Math.max(0,...reports.map(r=>r.bestMs))
 const assessed=frames>0&&visible/frames>=.7&&covered>=totalMs*.99&&totalMs>0
 const issues:Partial<PostureReport['issues']>={}
 for(const r of reports)for(const [name,v] of Object.entries(r.issues)){if(!v||!Number.isFinite(v.ms)||!Number.isFinite(v.firstMs))continue;const k=name as Deviation;const old=issues[k];issues[k]={ms:(old?.ms??0)+v.ms,firstMs:Math.min(old?.firstMs??Infinity,v.firstMs)}}
 return {assessed,percent:assessed?Math.round(good/totalMs*100):null,good,best,coverage:frames?Math.round(visible/frames*100):0,issues}
}
