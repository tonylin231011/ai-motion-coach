import type { Exercise } from './types'
import { isTimedExercise } from './types'
import type { TrainingPlan } from './workoutMetrics'

export type PlanField = keyof TrainingPlan
export type NumberRule = { min:number;max:number;step:number;label:string;presets:number[] }
export function planRules(exercise:Exercise):Record<PlanField,NumberRule> {
 const timed=isTimedExercise(exercise)
 return {sets:{min:1,max:20,step:1,label:'组数',presets:[]},target:{min:timed?5:1,max:exercise==='wall_sit'?120:timed?600:200,step:timed?5:1,label:timed?'每组时长（秒）':'每组次数',presets:timed?[30,45,60,90]:[8,10,12,15,20]},restSeconds:{min:5,max:600,step:5,label:'组间休息（秒）',presets:[30,45,60,90]}}
}
export const digits=(value:string)=>value.replace(/[^0-9]/g,'')
export function validateNumber(text:string,previous:number,rule:NumberRule){
 const n=Number(text)
 if(!text||n===0)return {value:previous,message:'请输入有效数字'}
 if(n>rule.max)return {value:rule.max,message:`最多 ${rule.max}`}
 if(n<rule.min)return {value:rule.min,message:`最少 ${rule.min}`}
 return {value:n,message:''}
}
const DEFAULTS='motion-coach.plan-defaults.v1',TODAY='motion-coach.plans-today.v1'
export function localDay(date=new Date()){return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`}
function valid(value:TrainingPlan|undefined,exercise:Exercise):value is TrainingPlan {const rules=planRules(exercise);return !!value&&Object.keys(rules).every(k=>{const key=k as PlanField,n=value[key];return Number.isInteger(n)&&n>=rules[key].min&&n<=rules[key].max})}
export function loadPlan(exercise:Exercise,fallback:TrainingPlan,date=new Date()):TrainingPlan {
 try{const today=JSON.parse(localStorage.getItem(TODAY)||'{}');if(today.day===localDay(date)&&valid(today.plans?.[exercise],exercise))return today.plans[exercise];const defaults=JSON.parse(localStorage.getItem(DEFAULTS)||'{}');if(valid(defaults[exercise],exercise))return defaults[exercise]}catch{/* Recommendations remain available when local storage is unavailable. */}
 return fallback
}
export function persistPlan(exercise:Exercise,plan:TrainingPlan,scope:'today'|'default',date=new Date()){
 if(!valid(plan,exercise))throw Error('计划数值无效')
 const parse=(key:string)=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}}
 const today=parse(TODAY),plans=today.day===localDay(date)?today.plans??{}:{}
 if(scope==='default'){const defaults=parse(DEFAULTS);localStorage.setItem(DEFAULTS,JSON.stringify({...defaults,[exercise]:plan}));delete plans[exercise]}
 else plans[exercise]=plan
 localStorage.setItem(TODAY,JSON.stringify({day:localDay(date),plans}))
}

/** Exclude time spent in a confirmation sheet from all detector/flow clocks. */
export class ConfirmationClock {
 private offset=0
 private frozen:number|null=null
 now(real:number){return (this.frozen??real)-this.offset}
 pause(real:number){this.frozen??=real;return this.now(real)}
 resume(real:number){if(this.frozen!==null){this.offset+=Math.max(0,real-this.frozen);this.frozen=null}return this.now(real)}
 get paused(){return this.frozen!==null}
}
