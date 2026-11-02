import { useEffect, useRef, useState } from 'react'
export function HoldToFinish({onFinish}:{onFinish:()=>void}){
  const [progress,setProgress]=useState(0),timer=useRef<ReturnType<typeof setInterval>|null>(null),at=useRef(0)
  const callback=useRef(onFinish);callback.current=onFinish
  const cancel=()=>{if(timer.current)clearInterval(timer.current);timer.current=null;setProgress(0)}
  const start=()=>{if(timer.current)return;at.current=performance.now();timer.current=setInterval(()=>{const p=(performance.now()-at.current)/1000;if(p>=1){cancel();callback.current()}else setProgress(p)},25)}
  useEffect(()=>()=>{if(timer.current)clearInterval(timer.current)},[])
  return <button className="hold-finish" style={{background:`linear-gradient(90deg,#446956 ${progress*100}%,transparent 0)`}} aria-label="长按一秒结束训练" onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);start()}} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onLostPointerCapture={cancel} onBlur={cancel} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)start()}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();cancel()}}} onContextMenu={e=>e.preventDefault()}>长按结束<span>{progress?`${Math.round(progress*100)}%`:'按住 1 秒'}</span></button>
}
