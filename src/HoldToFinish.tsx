import { useEffect, useRef, useState } from 'react'
export function HoldToFinish({onFinish}:{onFinish:()=>void}){
 const [progress,setProgress]=useState(0),[hint,setHint]=useState(false),timer=useRef<ReturnType<typeof setInterval>|null>(null),at=useRef(0),done=useRef(false),button=useRef<HTMLButtonElement>(null)
 const callback=useRef(onFinish);callback.current=onFinish
 const cancel=()=>{if(timer.current)clearInterval(timer.current);timer.current=null;setProgress(0)}
 const release=()=>{if(timer.current&&!done.current)setHint(true);cancel()}
 const start=()=>{if(timer.current||done.current)return;setHint(false);at.current=performance.now();timer.current=setInterval(()=>{const p=(performance.now()-at.current)/1000;if(p>=1){done.current=true;cancel();window.getSelection()?.removeAllRanges();try{navigator.vibrate?.(30)}catch{/* Optional device feedback. */}callback.current()}else setProgress(p)},20)}
 useEffect(()=>{const b=button.current,prevent=(e:Event)=>e.preventDefault();b?.addEventListener('selectstart',prevent);return()=>{cancel();b?.removeEventListener('selectstart',prevent)}},[])
 return <button ref={button} className={`hold-finish ${hint?'hold-hint':''}`} style={{background:`linear-gradient(90deg,#b7e777 ${progress*100}%,transparent ${progress*100}%)`}} aria-label="长按一秒结束训练" onPointerDown={e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);start()}} onPointerUp={release} onPointerCancel={cancel} onPointerLeave={cancel} onLostPointerCapture={cancel} onBlur={cancel} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)start()}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();release()}}} onClick={e=>{e.preventDefault();e.stopPropagation()}} onContextMenu={e=>e.preventDefault()}>长按结束<span role="status">{progress?`${Math.min(100,Math.round(progress*100))}%`:hint?'请按住1秒':'按住 1 秒'}</span></button>
}
