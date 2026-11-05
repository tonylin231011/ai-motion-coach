import {readPoseScore} from './poseScoring'
import type {WorkoutDraft} from './localWorkout'
import {isTimedExercise} from './types'
export function localPoseSummary(draft:WorkoutDraft){
 const timed=isTimedExercise(draft.exercise),groups=draft.sessions.map((s,i)=>{const p=readPoseScore(s.id);if(!p||p.exercise!==s.exercise||!p.metric)return {group:i+1,report:null,rate:null,coverage:0}
 const count=timed?p.totalMs:p.records,observed=timed?p.observedMs:p.reps.length,good=timed?p.goodMs:p.reps.filter(r=>r.good).length,coverage=count>0?Math.min(1,observed/count):0
 const usable=p.frames>=3&&coverage>=.7&&p.visibleFrames/p.frames>=.7&&p.visibleFrames>0&&p.visibilitySum/p.visibleFrames>=.65
 return {group:i+1,report:p,rate:usable&&observed>0?good/observed:null,coverage}
 })
 const rated=groups.filter(g=>g.rate!==null),observed=rated.reduce((n,g)=>n+(timed?g.report!.observedMs:g.report!.reps.length),0),good=rated.reduce((n,g)=>n+(timed?g.report!.goodMs:g.report!.reps.filter(r=>r.good).length),0)
 return {groups,percent:observed>0?Math.round(good/observed*100):null,metric:rated[0]?.report?.metric??'',observed,good,timed}
}
