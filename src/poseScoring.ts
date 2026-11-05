import type {Exercise} from './types'
export type ScorePoint={x:number;y:number;z?:number;visibility?:number}
export type PoseScore={version:1;exercise:Exercise;metric:string;frames:number;visibleFrames:number;observedMs:number;goodMs:number;totalMs:number;reps:{index:number;angle:number;good:boolean;visibility:number}[];records:number;visibilitySum:number}
const rules={squat:{ids:[23,25,27],limit:108,label:'可见膝角幅度'},pushup:{ids:[11,13,15],limit:95,label:'可见肘角幅度'},plank:{ids:[11,23,27],limit:165,label:'肩髋踝直线'},wall_sit:{ids:[23,25,27],limit:100,label:'可见膝角范围'}}
const length=(a:ScorePoint,b:ScorePoint)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??NaN)-(b.z??NaN))
export function measureScore(exercise:Exercise,image:ScorePoint[],world:ScorePoint[]){
 if(!(exercise in rules))return null
 const rule=rules[exercise as keyof typeof rules]
 const sides=[rule.ids,rule.ids.map(i=>i+1)].map(ids=>{const ps=ids.map(i=>world[i]),vis=ids.map(i=>image[i]);if(!ps.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))||!vis.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&(p.visibility??0)>=.65))return null
 const [a,b,c]=ps,u=length(a,b),v=length(c,b);if(u<.03||v<.03||Math.max(u,v)/Math.min(u,v)>4)return null
 const dot=(a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y)+(a.z!-b.z!)*(c.z!-b.z!)
 const angle=Math.acos(Math.max(-1,Math.min(1,dot/(u*v))))*180/Math.PI,visibility=Math.min(...vis.map(p=>p.visibility!))
 return {angle,visibility,metric:rule.label,good:exercise==='plank'?angle>=165:exercise==='wall_sit'?angle>=80&&angle<=100:angle<=rule.limit}
 }).filter((p):p is NonNullable<typeof p>=>p!==null)
 return sides.sort((a,b)=>b.visibility-a.visibility)[0]??null
}
export class PoseScoring {
 report:PoseScore
 private previousVisible=false;private last:number|null=null;private cycle:{angle:number;visibility:number;frames:number;visible:number}|null=null
 constructor(exercise:Exercise){this.report={version:1,exercise,metric:exercise in rules?rules[exercise as keyof typeof rules].label:'',frames:0,visibleFrames:0,observedMs:0,goodMs:0,totalMs:0,reps:[],records:0,visibilitySum:0}}
 sample(t:number,image:ScorePoint[],world:ScorePoint[]){const dt=this.last===null?0:Math.max(0,t-this.last);this.last=t;const m=measureScore(this.report.exercise,image,world);this.report.frames++;this.cycle??={angle:180,visibility:1,frames:0,visible:0};this.cycle.frames++
 const previousVisible=this.previousVisible;this.previousVisible=!!m
 if(!m)return;this.report.visibleFrames++;this.report.visibilitySum+=m.visibility;this.cycle.visible++;this.cycle.angle=Math.min(this.cycle.angle,m.angle);this.cycle.visibility=Math.min(this.cycle.visibility,m.visibility)
 if(previousVisible&&dt<=700){this.report.observedMs+=dt;if(m.good)this.report.goodMs+=dt}
 }
 rep(index:number){const c=this.cycle;this.report.records=index;if(c&&c.frames>=3&&c.visible>=3&&c.visible/c.frames>=.7&&this.report.reps.length<500){const limit=this.report.exercise==='pushup'?95:108;this.report.reps.push({index,angle:c.angle,good:c.angle<=limit,visibility:c.visibility})}this.cycle=null}
 pause(){this.previousVisible=false;this.last=null;this.cycle=null}
 finish(totalMs:number,records:number){return {...this.report,totalMs,records}}
}
const key=(id:string)=>`motion-coach.pose-score.v1:${id}`
export function savePoseScore(id:string,report:PoseScore){localStorage.setItem(key(id),JSON.stringify(report))}
export function readPoseScore(id:string):PoseScore|null{try{const r=JSON.parse(localStorage.getItem(key(id))||'null');if(r?.version!==1||![r.frames,r.visibleFrames,r.observedMs,r.goodMs,r.totalMs,r.records,r.visibilitySum].every(n=>Number.isFinite(n)&&n>=0)||r.visibleFrames>r.frames||r.goodMs>r.observedMs||r.observedMs>r.totalMs+700||!Array.isArray(r.reps)||r.reps.length>500||!r.reps.every((p:{index:number;angle:number;visibility:number;good:boolean})=>Number.isInteger(p.index)&&p.index>0&&Number.isFinite(p.angle)&&p.angle>=0&&p.angle<=180&&p.visibility>=.65&&p.visibility<=1&&typeof p.good==='boolean'))return null;return r}catch{return null}}
