import { useEffect, useRef, useState } from 'react'
export function EndTrainingSheet({description,onContinue,onFinish}:{description:string;onContinue:()=>void;onFinish:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),submitted=useRef(false),[busy,setBusy]=useState(false)
 const cancel=()=>{if(!submitted.current)onContinue()}
 useEffect(()=>{const el=dialog.current,previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';el?.showModal();return()=>{el?.close();document.body.style.overflow=overflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()}},[])
 return <dialog ref={dialog} className="end-training-sheet" aria-labelledby="end-training-title" aria-describedby="end-training-description" onCancel={e=>{e.preventDefault();cancel()}} onClick={e=>{if(e.target===e.currentTarget)cancel()}}><div className="end-sheet-content"><h2 id="end-training-title">结束本次训练？</h2><p id="end-training-description">{description}</p><button autoFocus className="end-save" disabled={busy} onClick={()=>{if(submitted.current)return;submitted.current=true;setBusy(true);window.getSelection()?.removeAllRanges();onFinish()}}>{busy?'正在保存…':'结束并保存'}</button><button className="end-continue" disabled={busy} onClick={cancel}>继续训练</button></div></dialog>
}
