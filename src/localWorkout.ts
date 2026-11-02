import { normalizeHistory, readHistory, saveSession, type Session } from './history'
import { EXERCISES, type Exercise } from './types'
import type { TrainingPlan } from './workoutMetrics'

export type WorkoutDraft={id:string;exercise:Exercise;plan:TrainingPlan;sessions:Session[];createdAt:number;replayIds:string[];ruleCounts:Record<string,number>}
const DRAFT='motion-coach.workout-draft.v2'
export function readDraft():WorkoutDraft|null {
  try {const d=JSON.parse(localStorage.getItem(DRAFT)||'null');return d&&typeof d.id==='string'&&EXERCISES.includes(d.exercise)&&Array.isArray(d.sessions)&&normalizeHistory(d.sessions).length===d.sessions.length&&d.plan&&Number.isFinite(d.plan.sets)&&Array.isArray(d.replayIds)?{...d,ruleCounts:d.ruleCounts??{}}:null}catch{return null}
}
export function storeDraft(d:WorkoutDraft){localStorage.setItem(DRAFT,JSON.stringify(d))}
export function saveDraft(d:WorkoutDraft){
  // Existing saveSession triggers exactly the existing sync path. IDs never change on retry.
  for(const session of d.sessions)saveSession(session)
  if(readDraft()?.id===d.id)localStorage.removeItem(DRAFT)
  return readHistory()
}

export type ReplayFrame={at:number;blob:Blob}
export type LocalReplay={id:string;frames:ReplayFrame[];createdAt:number;label:string;score:number}
const DATABASE='motion-coach-local-replays-v2'
async function db(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DATABASE,1);r.onupgradeneeded=()=>r.result.createObjectStore('clips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function storeReplay(clip:LocalReplay){
  const database=await db()
  try {await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('clips','readwrite'),store=tx.objectStore('clips')
    store.put(clip)
    const request=store.getAll();request.onsuccess=()=>{
      const clips=(request.result as LocalReplay[]).sort((a,b)=>b.createdAt-a.createdAt)
      let bytes=0
      clips.forEach((c,i)=>{bytes+=c.frames.reduce((n,f)=>n+f.blob.size,0);if((i>=10||bytes>20*1024*1024)&&c.id!==clip.id)store.delete(c.id)})
    }
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  })}finally{database.close()}
}
export async function readReplay(id:string):Promise<LocalReplay|null>{
  const database=await db()
  try{return await new Promise((resolve,reject)=>{const tx=database.transaction('clips');const r=tx.objectStore('clips').get(id);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)})}finally{database.close()}
}

/** Short low-resolution JPEG ring, not a whole-session recording. No fetch/upload API. */
export class ReplayBuffer {
  private canvas=document.createElement('canvas')
  private frames:ReplayFrame[]=[]
  private last=0
  private pending=false
  private closed=false
  private epoch=0
  best:LocalReplay|null=null
  capture(video:HTMLVideoElement,skeleton:HTMLCanvasElement,t:number){
    if(this.closed||this.pending||t-this.last<250||!video.videoWidth)return
    this.last=t;this.pending=true;const epoch=this.epoch
    this.canvas.width=320;this.canvas.height=Math.max(1,Math.round(320*video.videoHeight/video.videoWidth))
    const c=this.canvas.getContext('2d');if(!c){this.pending=false;return}
    c.drawImage(video,0,0,this.canvas.width,this.canvas.height)
    c.drawImage(skeleton,0,0,this.canvas.width,this.canvas.height)
    this.canvas.toBlob(blob=>{this.pending=false;if(!blob||this.closed||epoch!==this.epoch)return;this.frames.push({at:t,blob});this.frames=this.frames.filter(f=>t-f.at<=12000)},'image/jpeg',.55)
  }
  consider(id:string,score:number,durationMs:number,label:string,t:number){
    if(this.best&&this.best.score>=score)return
    const frames=this.frames.filter(f=>f.at>=t-Math.min(12000,Math.max(2000,durationMs+1000)))
    if(frames.length)this.best={id,score,label,frames:[...frames],createdAt:Date.now()}
  }
  resetGroup(){this.frames=[];this.best=null;this.epoch++}
  close(){this.closed=true;this.frames=[];this.best=null;this.epoch++}
}
