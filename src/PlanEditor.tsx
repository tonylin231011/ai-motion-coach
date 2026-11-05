import { useEffect, useId, useRef, useState } from 'react'
import { digits, planRules, validateNumber, type NumberRule, type PlanField } from './trainingControls'
import type { Exercise } from './types'
import type { TrainingPlan } from './workoutMetrics'

function StepButton({label,disabled,onStep,children}:{label:string;disabled:boolean;onStep:()=>void;children:React.ReactNode}){
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),repeated=useRef(false),callback=useRef(onStep);callback.current=onStep
 const stop=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null}
 useEffect(()=>{window.addEventListener('blur',stop);return()=>{stop();window.removeEventListener('blur',stop)}},[])
 return <button type="button" className="number-step" aria-label={label} disabled={disabled} onPointerDown={e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();repeated.current=false;e.currentTarget.setPointerCapture(e.pointerId);const repeat=()=>{repeated.current=true;callback.current();timer.current=setTimeout(repeat,140)};timer.current=setTimeout(repeat,450)}} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={()=>{repeated.current=true;stop()}} onLostPointerCapture={stop} onClick={()=>{if(!repeated.current)callback.current();repeated.current=false}}>{children}</button>
}
function NumberField({rule,text,message,disabled,onText,onCommit,onSet}:{rule:NumberRule;text:string;message:string;disabled:boolean;onText:(s:string)=>void;onCommit:()=>void;onSet:(n:number)=>void}){
 const id=useId(),input=useRef<HTMLInputElement>(null)
 const step=(d:number)=>onSet(Math.max(rule.min,Math.min(rule.max,(Number(text)||rule.min)+d)))
 const keepFocus=(e:React.PointerEvent)=>e.preventDefault()
 return <div className="number-field"><label htmlFor={id}>{rule.label}</label><div className="number-controls">
  <StepButton label={`减少${rule.label}`} disabled={disabled} onStep={()=>step(-rule.step)}>−</StepButton>
  <input ref={input} id={id} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" value={text} disabled={disabled} aria-describedby={`${id}-hint`} onChange={e=>onText(digits(e.target.value))} onBlur={onCommit} onFocus={e=>{e.currentTarget.select();requestAnimationFrame(()=>input.current?.scrollIntoView({block:'center',behavior:'smooth'}))}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}}}/>
  <button type="button" className="number-clear" aria-label={`清空${rule.label}`} disabled={disabled} onPointerDown={keepFocus} onClick={()=>{onText('');input.current?.focus()}}>×</button>
  <StepButton label={`增加${rule.label}`} disabled={disabled} onStep={()=>step(rule.step)}>+</StepButton>
 </div><div className="number-presets">{rule.presets.map(n=><button type="button" key={n} disabled={disabled} onClick={()=>onSet(n)}>{n}{rule.label.includes('秒')?' 秒':''}</button>)}</div><p id={`${id}-hint`} className="number-message" role="status">{message||`${rule.min}–${rule.max}${rule.label.includes('秒')?' 秒':''}`}</p></div>
}
export function PlanEditor({exercise,plan,disabled,onSave}:{exercise:Exercise;plan:TrainingPlan;disabled:boolean;onSave:(plan:TrainingPlan,scope:'today'|'default')=>void}){
 const [text,setText]=useState(()=>({sets:String(plan.sets),target:String(plan.target),restSeconds:String(plan.restSeconds)})),previous=useRef({...plan})
 const [messages,setMessages]=useState<Partial<Record<PlanField,string>>>({}),[scope,setScope]=useState<'today'|'default'>('default'),[status,setStatus]=useState('')
 const details=useRef<HTMLDetailsElement>(null),rules=planRules(exercise)
 const [keyboard,setKeyboard]=useState<{bottom:number}|null>(null)
 const commit=(key:PlanField)=>{const result=validateNumber(text[key],previous.current[key],rules[key]);previous.current[key]=result.value;setText(s=>({...s,[key]:String(result.value)}));if(result.message)setMessages(s=>({...s,[key]:result.message}));return result.value}
 const set=(key:PlanField,n:number)=>{previous.current[key]=n;setText(s=>({...s,[key]:String(n)}));setMessages(s=>({...s,[key]:''}));setStatus('')}
 const save=()=>{const next={sets:commit('sets'),target:commit('target'),restSeconds:commit('restSeconds')};try{onSave(next,scope);setStatus(scope==='default'?'已保存为此动作的默认计划（当前浏览器）':'已保存，仅今天使用')}catch{setStatus('保存失败，请保持此页并重试')}}
 useEffect(()=>{const viewport=window.visualViewport;const update=()=>{const focused=document.activeElement instanceof HTMLInputElement&&document.activeElement.type==='text'&&details.current?.contains(document.activeElement);setKeyboard(focused?{bottom:Math.max(0,window.innerHeight-(viewport?.height??window.innerHeight)-(viewport?.offsetTop??0))}:null)};const resize=()=>{update();if(details.current?.contains(document.activeElement))document.activeElement?.scrollIntoView({block:'center'})};document.addEventListener('focusin',update);document.addEventListener('focusout',update);viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',update);return()=>{document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);viewport?.removeEventListener('resize',resize);viewport?.removeEventListener('scroll',update)}},[])
 return <details className="plan-editor" ref={details}><summary>调整训练计划</summary><div className="plan-fields">{(['sets','target','restSeconds'] as const).map(key=><NumberField key={key} rule={rules[key]} text={text[key]} message={messages[key]||''} disabled={disabled} onText={s=>{setText(v=>({...v,[key]:s}));setMessages(v=>({...v,[key]:''}));setStatus('')}} onCommit={()=>commit(key)} onSet={n=>set(key,n)}/>)}
 {exercise==='wall_sit'&&<p className="plan-note">靠墙静蹲最多120秒，与现有云端记录保持兼容。</p>}
 <fieldset className="plan-scope"><legend>这份计划用于</legend><label><input type="radio" name="plan-scope" checked={scope==='today'} onChange={()=>setScope('today')}/>仅今天</label><label><input type="radio" name="plan-scope" checked={scope==='default'} onChange={()=>setScope('default')}/>保存为默认</label></fieldset>
 <div className="plan-done"><button type="button" disabled={disabled} onClick={save}>完成并保存计划</button><p role="status">{status}</p></div>
 {keyboard&&<div className="keyboard-done" style={{bottom:keyboard.bottom}} onPointerDown={e=>e.preventDefault()}><button type="button" onClick={()=>{save();if(document.activeElement instanceof HTMLElement)document.activeElement.blur();setKeyboard(null)}}>完成输入并保存</button></div>}
 </div></details>
}
