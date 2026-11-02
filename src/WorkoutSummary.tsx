import { useEffect, useRef, useState } from 'react'
import { EXERCISE_NAMES, isTimedExercise } from './types'
import { duration, type Session } from './history'
import { biggestIssue, deltaLabel, previousSession, quality, QUALITY_NOTE } from './workoutMetrics'
import { readReplay, type LocalReplay, type WorkoutDraft } from './localWorkout'

function Replay({ids}:{ids:string[]}){
  const [clip,setClip]=useState<LocalReplay|null>(null),[status,setStatus]=useState(''),[playing,setPlaying]=useState(false),[frame,setFrame]=useState(0)
  const [urls,setUrls]=useState<string[]>([])
  useEffect(()=>{if(!clip)return;const next=clip.frames.map(f=>URL.createObjectURL(f.blob));setUrls(next);return()=>next.forEach(URL.revokeObjectURL)},[clip])
  useEffect(()=>{if(!playing||!clip)return;const start=performance.now(),first=clip.frames[0].at;const timer=setInterval(()=>{const elapsed=(performance.now()-start)%Math.max(250,clip.frames.at(-1)!.at-first+250);const index=clip.frames.findIndex(f=>f.at-first>elapsed);setFrame(Math.max(0,index===-1?clip.frames.length-1:index-1))},80);return()=>clearInterval(timer)},[playing,clip])
  const load=async()=>{
    setStatus('正在读取本机回放…')
    try{const clips=(await Promise.all(ids.map(readReplay))).filter((c):c is LocalReplay=>!!c);const best=clips.sort((a,b)=>b.score-a.score)[0];if(!best){setStatus('本机没有回放：可能未录到、在其他设备训练，或旧片段已清理。');return}setClip(best);setPlaying(true);setStatus(best.label)}catch{setStatus('此浏览器暂时无法读取本机回放；训练统计不受影响。')}
  }
  return <section className="replay-card"><button className="secondary" onClick={()=>clip?setPlaying(!playing):void load()}>{clip?playing?'暂停回放':'继续回放':'回放最需关注的片段'}</button><p className="history-note">仅本机 · 最长 12 秒 · 不上传 · 最多保留最近 10 段</p>{status&&<p role="status">{status}</p>}{clip&&urls[frame]&&<img className="local-replay" src={urls[frame]} alt="本机训练回放画面" />}</section>
}

export function WorkoutSummary({draft,history,onSave,onDone,saved=false,error=''}:{draft:WorkoutDraft;history:Session[];onSave:()=>void;onDone:()=>void;saved?:boolean;error?:string}){
  const [shareStatus,setShareStatus]=useState(''),[shareUrl,setShareUrl]=useState('')
  const sharing=useRef(false)
  useEffect(()=>()=>{if(shareUrl)URL.revokeObjectURL(shareUrl)},[shareUrl])
  const q=quality(draft.sessions),previous=previousSession(history,draft.exercise,Math.min(...draft.sessions.map(s=>s.endedAt))),old=previous?quality([previous]).percent:null
  const timed=isTimedExercise(draft.exercise),total=draft.sessions.reduce((n,s)=>n+s.repCount,0),attempts=draft.sessions.reduce((n,s)=>n+s.attemptCount,0)
  const held=draft.sessions.reduce((n,s)=>n+(s.hold?.heldMs??0),0),elapsed=draft.sessions.reduce((n,s)=>n+s.durationMs,0)
  const issue=biggestIssue(draft.sessions)
  const form=Object.entries(draft.ruleCounts).sort((a,b)=>b[1]-a[1])[0]
  const formLabel=form&&form[1]>issue.count?(form[0]==='knees-in'?'膝盖方向':form[0]==='lean'?'躯干控制':null):null
  const title=formLabel??issue.title
  const advice=formLabel?`观察到 ${form[1]} 个动作出现${formLabel}提示。下次先控制动作，必要时降低训练量；仅评价画面可见部位。`:issue.text
  const share=async()=>{
    if(sharing.current)return;sharing.current=true
    try{
      const c=document.createElement('canvas');c.width=1080;c.height=1080;const ctx=c.getContext('2d')!;ctx.fillStyle='#f6f8f3';ctx.fillRect(0,0,1080,1080)
      ctx.fillStyle='#17664d';ctx.font='bold 44px sans-serif';ctx.fillText('AI 动作教练',80,100);ctx.fillStyle='#152c22';ctx.font='bold 66px sans-serif';ctx.fillText('每一次坚持，都算进步',80,240)
      ctx.font='40px sans-serif';ctx.fillText(`${EXERCISE_NAMES[draft.exercise]} · ${draft.sessions.length} 组`,80,330)
      ctx.font='bold 120px sans-serif';ctx.fillStyle='#17664d';ctx.fillText(timed?duration(held):`${total} 次`,80,520)
      ctx.font='36px sans-serif';ctx.fillStyle='#354b3e';ctx.fillText(timed?'累计保持':draft.exercise==='squat'?'有效次数':'完成次数',80,585)
      ctx.fillText(`可见动作标准率：${q.percent===null?'未评估':q.percent+'%'}`,80,700);ctx.fillText(`训练用时：${duration(elapsed)}`,80,770)
      ctx.font='26px sans-serif';ctx.fillText('仅评价可见幅度与节奏；静态保持不评分',80,930);ctx.fillText('成果卡不包含训练画面',80,975)
      const blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('生成失败')),'image/png'))
      const file=new File([blob],'训练成果.png',{type:'image/png'})
      if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'我的训练成果'});setShareStatus('已打开系统分享');return}catch(e){if(e instanceof Error&&e.name==='AbortError'){setShareStatus('已取消分享');return}}}
      setShareUrl(URL.createObjectURL(blob));setShareStatus('成果卡已生成，可下载或长按图片保存。')
    }catch{setShareStatus('成果卡生成失败，请重试。')}finally{sharing.current=false}
  }
  return <section className="workout-summary" aria-label="训练总结"><header><p className="eyebrow">把进步，留在这里</p><h2>训练完成</h2><p>{EXERCISE_NAMES[draft.exercise]} · {draft.sessions.length} 组 · 用时 {duration(elapsed)}</p></header>
    <div className="summary-score"><div className="score-ring" style={{background:`conic-gradient(#17664d ${(q.percent??0)*3.6}deg,#e4ebe4 0)`}}><strong>{q.percent===null?'—':`${q.percent}%`}</strong></div><div><p>可见动作标准率</p><h3>{deltaLabel(q.percent,old)}</h3><div className="summary-totals"><div><strong>{timed?duration(held):total}</strong><span>{timed?'累计保持':draft.exercise==='squat'?'有效':'完成'}</span></div>{!timed&&<div><strong>{attempts}</strong><span>尝试</span></div>}<div><strong>{draft.sessions.length}</strong><span>组数</span></div></div></div></div>
    <p className="history-note">{QUALITY_NOTE}{timed?' 本动作仅计时，不给标准率。':''}</p>
    <section className="summary-sets"><h3>{timed?'每组保持时长':'每组可见动作标准率'}</h3>{draft.sessions.map((s,i)=>{const value=quality([s]).percent,heldMs=s.hold?.heldMs??0;return <div key={s.id}><span>第 {i+1} 组</span><progress max={timed?Math.max(1,draft.plan.target)*1000:100} value={timed?heldMs:value??0} aria-label={`第${i+1}组${timed?`保持${duration(heldMs)}`:value===null?'未评估':`标准率${value}%`}`} /><b>{timed?duration(heldMs):value===null?'未评估':`${value}%`}</b></div>})}</section>
    <section className="improvement"><small>最需改进 · {title}</small><p>{advice}</p></section>
    <Replay ids={draft.replayIds} />
    {error&&<p className="error" role="alert">{error}</p>}
    {!draft.sessions.length&&<p className="notice">本次尚未开始第一组，没有生成训练记录。</p>}
    <button className="primary-action" onClick={saved?onDone:onSave}>{saved?'完成，查看记录':'保存并完成'}</button>
    <button className="share-action" onClick={()=>void share()}>分享成果卡</button>
    {shareStatus&&<p role="status">{shareStatus}</p>}{shareUrl&&<a href={shareUrl} download="训练成果.png"><img className="share-preview" src={shareUrl} alt="可保存的训练成果卡" /></a>}
  </section>
}
