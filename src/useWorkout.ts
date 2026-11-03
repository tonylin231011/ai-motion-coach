import { posture, TimedPosture, savePosture } from './timedPosture'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Exercise, Landmarks } from './types'
import { WorkoutFlow, type FlowView } from './workoutFlow'
import type { TrainingPlan } from './workoutMetrics'
import { drawSkeleton, type PoseDot } from './poseFeedback'
import { ReplayBuffer, storeDraft, storeReplay, type WorkoutDraft } from './localWorkout'

const MAP: Record<number,keyof Landmarks>={11:'left_shoulder',12:'right_shoulder',13:'left_elbow',14:'right_elbow',15:'left_wrist',16:'right_wrist',23:'left_hip',24:'right_hip',25:'left_knee',26:'right_knee',27:'left_ankle',28:'right_ankle'}
const prefix=(e:Exercise)=>e==='wall_sit'?'v18-wall':e==='dumbbell_curl'?'v17-curl':e==='russian_twist'?'v16-twist':e==='reverse_crunch'?'v15-crunch':e==='plank'?'v12-plank':e==='pushup'?'v8-push':'v5'
type PoseRuntime={detectForVideo:(v:HTMLVideoElement,t:number)=>{landmarks:PoseDot[][]};close:()=>void}

export function useWorkout(onDraft:(draft:WorkoutDraft,finished:boolean)=>void){
  const backdropRef=useRef<HTMLVideoElement>(null),videoRef=useRef<HTMLVideoElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),audioRef=useRef<HTMLAudioElement>(null)
  const callback=useRef(onDraft);callback.current=onDraft
  const flow=useRef<WorkoutFlow|null>(null),pose=useRef<PoseRuntime|null>(null),stream=useRef<MediaStream|null>(null)
  const raf=useRef<number|null>(null),generation=useRef(0),starting=useRef(false),active=useRef(false)
  const buffer=useRef<ReplayBuffer|null>(null),draft=useRef<WorkoutDraft|null>(null),storedGroups=useRef(0),seenRecords=useRef(0)
  const pendingRules=useRef(new Set<string>()),persist=useRef(Promise.resolve()),finishQueued=useRef(false)
  const [anchor,setAnchor]=useState<{x:number;y:number}|null>(null)
  const [luminance,setLuminance]=useState<number|null>(null)
  const [view,setView]=useState<FlowView|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('')
  const [voiceEnabled,setVoiceEnabled]=useState(true),enabled=useRef(true),lastVoice=useRef({key:'',at:0})
  const [voiceStatus,setVoiceStatus]=useState('语音已开启'),[replayStatus,setReplayStatus]=useState('回放仅保存在本机')
  const assessment=useRef(new TimedPosture()),bodyReady=useRef(false)
  const [framing,setFraming]=useState('')
  const countdownVoice=useRef('')
  const spokenEvent=useRef('')
  const announce=useCallback((key:string,force=false)=>{
    const audio=audioRef.current;if(!audio||(!enabled.current&&!force))return
    const now=Date.now();if(!force&&(now-lastVoice.current.at<3000||(!audio.paused&&!audio.ended)))return
    if(key===lastVoice.current.key&&now-lastVoice.current.at<3000)return
    lastVoice.current={key,at:now};audio.pause();audio.src=`${import.meta.env.BASE_URL}voice/${key}.mp3`
    audio.onplaying=()=>setVoiceStatus('教练语音播放中');audio.onended=()=>setVoiceStatus(enabled.current?'语音已开启':'语音已关闭')
    audio.onerror=()=>setVoiceStatus('语音加载失败，可点击试听重试')
    void audio.play().catch(()=>setVoiceStatus('点击试听激活语音，并检查手机媒体音量'))
    return true
  },[])
  const teardown=useCallback(()=>{
    active.current=false;generation.current++;if(raf.current!==null)cancelAnimationFrame(raf.current);raf.current=null
    stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;pose.current?.close();pose.current=null
    audioRef.current?.pause();buffer.current?.close();buffer.current=null
  },[])
  const publish=useCallback((next:FlowView,t:number)=>{
    const controller=flow.current,current=draft.current;if(!controller||!current)return
    setView(next)
    if(next.stage==='active'&&['knees-in','lean'].includes(next.feedback.key))pendingRules.current.add(next.feedback.key)
    const completed=controller.sessions.length>storedGroups.current
    const records=completed?controller.sessions.at(-1)!.records:controller.latestRecords()
    if(records.length>seenRecords.current){
      const record=records.at(-1)!
      for(const key of pendingRules.current)current.ruleCounts[key]=(current.ruleCounts[key]??0)+1
      const score=(record.issue==='shallow'?3:record.issue==='fast'?2:0)+pendingRules.current.size
      buffer.current?.consider(controller.currentId,score,record.durationMs,record.issue==='shallow'?'幅度偏小的一次':record.issue==='fast'?'节奏偏快的一次':pendingRules.current.size?'出现姿势提示的一次':'本组动作片段（未发现幅度或节奏提示）',t)
      pendingRules.current.clear();seenRecords.current=records.length
    }
    if(next.stage==='countdown'){
      const key=`${next.group}:${next.countdown}`
      if(countdownVoice.current!==key){countdownVoice.current=key;if(enabled.current)announce(`rep-${next.countdown}`,true)}
    }
    else if(next.stage==='active'&&next.snapshot.cue){
      const key=`${next.group}:${next.snapshot.repCount}:${next.snapshot.feedbackId}:${next.snapshot.cue}`
      if(key!==spokenEvent.current&&announce(`${prefix(controller.exercise)}-${next.snapshot.cue}`))spokenEvent.current=key
    }
    if(next.stage!=='countdown')countdownVoice.current=''
    if(next.stage!=='active')assessment.current.pause()
    if(completed){
      const session=controller.sessions.at(-1)!
      if(session.exercise==='plank'||session.exercise==='wall_sit'){try{savePosture(session.id,{...assessment.current.report,totalMs:session.hold?.heldMs??0})}catch{setError('姿态统计未能保存在本机，训练时长仍保留')}assessment.current=new TimedPosture()}
      if(!buffer.current?.best)buffer.current?.consider(controller.currentId,0,6000,'本组保持片段（仅本机，姿势未评分）',t)
      const clip=buffer.current?.best
      if(clip){current.replayIds.push(clip.id);persist.current=persist.current.then(()=>storeReplay(clip)).catch(()=>setReplayStatus('本机空间或权限不足，回放未保存；训练记录仍保留'))}
      current.sessions=[...controller.sessions];storedGroups.current=controller.sessions.length
      seenRecords.current=0;pendingRules.current.clear();buffer.current?.resetGroup()
      try{storeDraft(current)}catch{setError('总结草稿暂时无法写入本机，请勿关闭页面，结束后重试保存')}
      callback.current({...current,sessions:[...current.sessions]},false)
    }
    if(next.stage==='summary'&&!finishQueued.current){
      finishQueued.current=true;current.sessions=[...controller.sessions]
      try{storeDraft(current)}catch{setError('总结未能缓存，请保持页面打开并点击保存重试')}
      teardown()
      void persist.current.finally(()=>callback.current({...current,sessions:[...current.sessions]},true))
    }
  },[announce,teardown])
  const init=(exercise:Exercise,plan:TrainingPlan,timerOnly:boolean)=>{
    flow.current=new WorkoutFlow(exercise,{...plan},timerOnly)
    draft.current={id:crypto.randomUUID(),exercise,plan:{...plan},sessions:[],createdAt:Date.now(),replayIds:[],ruleCounts:{}}
    storedGroups.current=0;seenRecords.current=0;pendingRules.current.clear();persist.current=Promise.resolve();finishQueued.current=false;spokenEvent.current='';countdownVoice.current=''
    assessment.current=new TimedPosture();bodyReady.current=false;setFraming('')
    active.current=true;setReplayStatus(timerOnly?'纯计时模式没有镜头回放':'回放仅保存在本机');setError('')
    if(!timerOnly)buffer.current=new ReplayBuffer()
    if(timerOnly)flow.current.manualStart(performance.now())
    setView(flow.current.view(performance.now()))
  }
  const start=async(exercise:Exercise,plan:TrainingPlan,timerOnly=false)=>{
    if(starting.current||active.current)return
    starting.current=true;setLoading(true);setError('')
    const token=++generation.current
    announce(`${prefix(exercise)}-start`)
    try{
      if(timerOnly){init(exercise,plan,true);return}
      if(!navigator.mediaDevices?.getUserMedia)throw Error('当前环境不能打开摄像头，请确认使用 HTTPS 并允许相机权限')
      const portrait=window.matchMedia('(orientation: portrait)').matches
      const incoming=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:portrait?480:640},height:{ideal:portrait?640:480},aspectRatio:{ideal:portrait?3/4:4/3},frameRate:{ideal:24,max:30}},audio:false})
      if(token!==generation.current){incoming.getTracks().forEach(t=>t.stop());return}
      stream.current=incoming
      const video=videoRef.current;if(!video)throw Error('视频预览未就绪')
      video.srcObject=incoming;await video.play()
      if(backdropRef.current){backdropRef.current.srcObject=incoming;void backdropRef.current.play().catch(()=>{/* Decorative backdrop only. */})}
      const {FilesetResolver,PoseLandmarker}=await import('@mediapipe/tasks-vision')
      const base=`${import.meta.env.BASE_URL}mediapipe/`
      const vision=await FilesetResolver.forVisionTasks(`${base}wasm`)
      const runtime=await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:`${base}pose_landmarker_lite.task`},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5})
      if(token!==generation.current){runtime.close();return}
      pose.current=runtime;init(exercise,plan,false)
      const lightCanvas=document.createElement('canvas');lightCanvas.width=32;lightCanvas.height=24
      const lightCtx=lightCanvas.getContext('2d',{willReadFrequently:true})
      let lastFrame=-1,inferenceAt=0,gap=90,lastLight=0,luminance:number|null=null
      const loop=(t:number)=>{
        if(!active.current||token!==generation.current)return
        try{
          if(!document.hidden&&video.readyState>=2&&video.currentTime!==lastFrame&&t-inferenceAt>=gap){
            lastFrame=video.currentTime;inferenceAt=t
            if(lightCtx&&t-lastLight>1000){lightCtx.drawImage(video,0,0,32,24);const data=lightCtx.getImageData(0,0,32,24).data;let total=0;for(let i=0;i<data.length;i+=4)total+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;luminance=total/(32*24);lastLight=t;setLuminance(luminance)}
            const began=performance.now(),result=runtime.detectForVideo(video,t);gap=Math.max(90,Math.min(350,(performance.now()-began)*2.5))
            const raw=result.landmarks[0]??[],landmarks:Landmarks={}
            for(const [index,name] of Object.entries(MAP)){const p=raw[Number(index)];if(p)landmarks[name]={...p,z:0,visibility:p.visibility??1}}
            const controller=flow.current!,timed=exercise==='plank'||exercise==='wall_sit'
            const observation=posture(raw,exercise,video.videoWidth,video.videoHeight)
            const viewport=video.parentElement!,fit=exercise==='russian_twist'||exercise==='dumbbell_curl'||exercise==='pushup'||exercise==='reverse_crunch'?Math.min:Math.max,scale=fit(viewport.clientWidth/video.videoWidth,viewport.clientHeight/video.videoHeight)
            const dx=(video.videoWidth*scale-viewport.clientWidth)/2,dy=(video.videoHeight*scale-viewport.clientHeight)/2
            bodyReady.current=observation.visible
            setFraming(timed&&!bodyReady.current?'请后退，让全身入镜':'')
            if(timed&&!bodyReady.current&&(controller.stage==='ready'||controller.stage==='countdown')){controller.pause(t);controller.resume()}
            const wasActive=controller.stage==='active',heldBefore=controller.view(t).snapshot.hold?.heldMs??0
            const next=controller.frame(timed&&!bodyReady.current&&!wasActive?{}:landmarks,t,video.videoWidth,video.videoHeight,luminance)
            if(timed&&wasActive){const held=controller.sessions.length>storedGroups.current?controller.sessions.at(-1)?.hold?.heldMs??heldBefore:next.snapshot.hold?.heldMs??heldBefore;assessment.current.sample(held,observation)}
            const joint=next.feedback.joints.map(i=>raw[i]).find(p=>p&&(p.visibility??1)>=.65)
            setAnchor(joint?{x:(viewport.clientWidth-(joint.x*video.videoWidth*scale-dx))/viewport.clientWidth*100,y:(joint.y*video.videoHeight*scale-dy)/viewport.clientHeight*100}:null)
            const canvas=canvasRef.current;if(canvas){if(canvas.width!==video.videoWidth||canvas.height!==video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight}const ctx=canvas.getContext('2d');if(ctx)drawSkeleton(ctx,raw,canvas.width,canvas.height,next.feedback);if(next.stage==='active')buffer.current?.capture(video,canvas,t)}
            publish(next,t)
          }
        }catch{flow.current?.pause(t,'识别暂时中断，请检查画面后继续');setError('识别中断，训练已暂停；可以结束并保存已有记录')}
        if(active.current)raf.current=requestAnimationFrame(loop)
      }
      raf.current=requestAnimationFrame(loop)
    }catch(e){teardown();setError(`启动失败：${e instanceof Error?e.message:'请检查相机权限'}`)}finally{starting.current=false;setLoading(false)}
  }
  useEffect(()=>{const timer=setInterval(()=>{if(active.current&&flow.current){const t=performance.now();publish(flow.current.tick(t),t)}},200)
    const hide=()=>{if(document.hidden&&active.current){flow.current?.pause(performance.now(),'切到后台，训练已暂停');audioRef.current?.pause()}}
    document.addEventListener('visibilitychange',hide)
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',hide);teardown()}
  },[publish,teardown])
  const action=(fn:(f:WorkoutFlow,t:number)=>void)=>{const f=flow.current;if(!f)return;const t=performance.now();fn(f,t);publish(f.view(t),t)}
  return {backdropRef,videoRef,canvasRef,audioRef,view,loading,error,luminance,anchor,framing,voiceEnabled,voiceStatus,replayStatus,start,timerOnly:flow.current?.timerOnly??false,
    toggleVoice:()=>{enabled.current=!enabled.current;setVoiceEnabled(enabled.current);announce(enabled.current?'on':'off',true)},testVoice:()=>announce('test',true),
    pause:()=>action((f,t)=>f.pause(t)),resume:()=>action(f=>f.resume()),manualStart:()=>{const f=flow.current;if(f&&!f.timerOnly&&(f.exercise==='plank'||f.exercise==='wall_sit')&&!bodyReady.current){setError('请后退，让全身入镜');return}action((f,t)=>f.manualStart(t))},skipRest:()=>action(f=>f.nextAfterRest()),finish:()=>action((f,t)=>f.finish(t)),clear:()=>{teardown();flow.current=null;setView(null)}}
}
