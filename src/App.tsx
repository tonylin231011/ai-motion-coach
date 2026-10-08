import { useCallback, useEffect, useRef, useState } from 'react'
import type { Landmarks, Point, SquatSnapshot, TrackingState } from './types'
import { SquatDetector } from './coachDetector'
import { PushupDetector } from './pushupDetector'
import { PlankDetector } from './plankDetector'
import { WallSitDetector } from './wallSitDetector'
import { WallSitProgress, WallSitHistoryProgress } from './WallSitProgress'
import { TwistDetector } from './twistDetector'
import { ReverseCrunchDetector } from './reverseCrunchDetector'
import { CurlDetector } from './curlDetector'
import { ActivityHeatmap } from './ActivityHeatmap'
import { EXERCISES, EXERCISE_NAMES, isTimedExercise, type Exercise } from './types'
import { readHistory, saveSession, review, duration, type Session } from './history'
import { downloadHistoryExport } from './historyExport'

const POSE_CONNECTIONS: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32],
]
const LANDMARK_MAP: Record<number, keyof Landmarks> = {
  11: 'left_shoulder', 12: 'right_shoulder', 23: 'left_hip', 24: 'right_hip',
  25: 'left_knee', 26: 'right_knee', 27: 'left_ankle', 28: 'right_ankle',
  13: 'left_elbow', 14: 'right_elbow', 15: 'left_wrist', 16: 'right_wrist',
}
const EMPTY_SNAPSHOT: SquatSnapshot = {
  phase: 'WAITING', repCount: 0, attemptCount: 0, averageKneeAngle: null,
  hipDisplacement: null, confidence: 0, feedback: '点击开始，让教练看见你',
}
const PHASE_LABELS: Record<SquatSnapshot['phase'], string> = {
  WAITING: '准备动作', STANDING: '站立准备', DESCENDING: '正在下蹲', BOTTOM: '动作最低点', ASCENDING: '正在起身',
}
const TRACKING_LABELS: Record<TrackingState, string> = {
  IDLE: '未开始', TRACKING: '正在识别', LOST: '未识别到身体',
}
const voicePrefix=(exercise:Exercise)=>exercise==='wall_sit' ? 'v18-wall' : exercise==='dumbbell_curl' ? 'v17-curl' : exercise==='russian_twist' ? 'v16-twist' : exercise==='reverse_crunch' ? 'v15-crunch' : exercise==='plank' ? 'v12-plank' : exercise==='pushup' ? 'v8-push' : 'v5'

type PoseRuntime = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => { landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>> }
  close: () => void
}

function metric(value: number | null, suffix = '') {
  return value === null ? '—' : `${value.toFixed(1)}${suffix}`
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const poseRef = useRef<PoseRuntime | null>(null)
  const detectorRef = useRef<SquatDetector | PushupDetector | PlankDetector | WallSitDetector | TwistDetector | ReverseCrunchDetector | CurlDetector>(new SquatDetector())
  const [exercise, setExercise] = useState<Exercise>('squat')
  const [historyFilter, setHistoryFilter] = useState<Exercise>('squat')
  const [plankMode,setPlankMode]=useState<'manual'|'auto'|'assisted'>('assisted')
  const [wallTargetSeconds,setWallTargetSeconds]=useState(20)
  const [holding,setHolding]=useState(false)
  const phaseLabels = exercise==='dumbbell_curl' ? {WAITING:'先放下手臂',STANDING:'手臂放下',DESCENDING:'正在弯起',BOTTOM:'弯举高位',ASCENDING:'控制放下'} : exercise==='russian_twist' ? {WAITING:'准备转体',STANDING:'左右转体',DESCENDING:'转向一侧',BOTTOM:'一侧到位',ASCENDING:'转向另一侧'} : exercise==='reverse_crunch' ? {WAITING:'准备伸腿',STANDING:'腿放远',DESCENDING:'收膝',BOTTOM:'已收膝',ASCENDING:'放回'} : isTimedExercise(exercise) ? {WAITING:'准备／暂停',STANDING:'正在保持',DESCENDING:'调整姿势',BOTTOM:'调整姿势',ASCENDING:'调整姿势'} : exercise==='squat' ? PHASE_LABELS : { WAITING:'准备支撑', STANDING:'高位支撑', DESCENDING:'正在下放', BOTTOM:'动作低位', ASCENDING:'正在推起' }
  const guidance = exercise==='dumbbell_curl' ? '手机放稳，正面略偏侧，拍清肩、肘和手腕，不必拍到脚。先自然放下手臂，再弯起并控制放回；每只手各计一次，双手同时一轮共计两次。' : exercise==='russian_twist' ? '坐好并正对镜头，让肩、髋和至少一只手入镜，不需要拍到脚。双手随身体向左右移动；左、右每侧到位各计一次。镜头提示会说明看不清哪个部位。' : exercise==='reverse_crunch' ? '手机固定在身体侧面，拍到肩、髋和至少一侧膝盖。仰卧后先把腿放远，再缓慢收膝、放回；收膝并放回计一次。' : exercise==='plank' ? '默认自动起表：开启摄像头后摆好前臂支撑，听到“开始计时”即可。开始后短暂看不清不会扣时；休息请点“暂停保持”。计时不代表动作合格，只拍上半身时无法确认腰腿姿态。' : exercise==='squat' ? '手机放稳，从身体侧面拍摄，让髋、膝盖和脚完整入镜。先站稳，再开始深蹲。' : '正面或侧面拍摄均可，让肩、肘和手腕清晰入镜，不必拍到脚。手机放稳，正常下压再推回，无需停顿校准。'
  const exerciseGuidance = exercise==='wall_sit' ? '背靠墙，双脚向前、与髋同宽，慢慢下蹲；膝盖顺着脚尖方向、小腿接近竖直。新手可蹲浅一些，自然呼吸。侧面拍到肩、髋、膝和脚踝；休息请点暂停。' : guidance
  const countLabel = exercise==='dumbbell_curl' ? '完成次数（每只手）' : isTimedExercise(exercise) ? '累计保持' : exercise==='squat' ? '有效次数' : '完成次数'
  const streamRef = useRef<MediaStream | null>(null)
  const lastUiUpdateRef = useRef(0)
  const lastFrameRef = useRef(-1)
  const inferenceAtRef = useRef(0)
  const inferenceGapRef = useRef(90)
  const spokenEventRef = useRef(0)
  const lastSpokenRef = useRef({ text: '', time: 0 })
  const [isRunning, setIsRunning] = useState(false)
  const [timerOnly, setTimerOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trackingState, setTrackingState] = useState<TrackingState>('IDLE')
  const [snapshot, setSnapshot] = useState<SquatSnapshot>(EMPTY_SNAPSHOT)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const voiceEnabledRef = useRef(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingVoiceRef = useRef<number | undefined>(undefined)
  const [voiceStatus, setVoiceStatus] = useState('语音默认开启，点击开始或试听激活')
  const sessionStartRef = useRef(0)
  const [history, setHistory] = useState(readHistory)
  const filteredHistory = history.filter(s=>s.exercise===historyFilter)
  const [summary, setSummary] = useState<Session | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if(summary || showHistory) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [summary, showHistory])
  useEffect(() => {
    if(!isRunning) return
    const timer=window.setInterval(()=>{
      const now=performance.now();setElapsed(now-sessionStartRef.current)
      const detector=detectorRef.current
      if(detector instanceof PlankDetector && detector.timerMode!=='auto') {
        const hold=detector.tick(now);setHolding(detector.running);setSnapshot(s=>({...s,hold,phase:detector.running ? 'STANDING':'WAITING'}))
      }
      if(detector instanceof WallSitDetector) {
        detector.tick(now)
        const next=detector.snapshot()
        setHolding(detector.running)
        setSnapshot(s=>({...s,...detector.getStats(),phase:next.phase,feedbackId:next.feedbackId,cue:next.cue,...(timerOnly ? {feedback:next.feedback} : {})}))
      }
    },250)
    const pauseOnHide=()=>{const d=detectorRef.current;if(document.hidden && (d instanceof PlankDetector || d instanceof WallSitDetector) && d.running){d.setRunning(false);setHolding(false)}}
    document.addEventListener('visibilitychange',pauseOnHide)
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',pauseOnHide)}
  }, [isRunning,timerOnly])

  const announce = useCallback((text: string, force = false) => {
    if (!force && !voiceEnabledRef.current) return
    const now = Date.now()
    window.clearTimeout(pendingVoiceRef.current)
    if (!force && ((audioRef.current && !audioRef.current.paused && !audioRef.current.ended) || now - lastSpokenRef.current.time < 4000)) {
      pendingVoiceRef.current = window.setTimeout(() => announce(text), 500)
      return
    }
    if (lastSpokenRef.current.text === text && now - lastSpokenRef.current.time < 2500) return
    lastSpokenRef.current = { text, time: now }
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.src = `${import.meta.env.BASE_URL}voice/${text}.mp3`
    audio.onplaying = () => setVoiceStatus('中文语音正在播放')
    audio.onended = () => setVoiceStatus(voiceEnabledRef.current ? '语音已就绪' : '语音已关闭')
    audio.onerror = () => setVoiceStatus('音频加载失败，请检查网络并点击试听重试')
    setVoiceStatus('正在加载提示音…')
    void audio.play().catch(error => {
      if (error.name !== 'AbortError') setVoiceStatus('播放未开始，请点击试听并检查媒体音量')
    })
  }, [])

  const finishTraining = () => {
    if(!sessionStartRef.current) return
    if(detectorRef.current instanceof PlankDetector) detectorRef.current.tick()
    if(detectorRef.current instanceof WallSitDetector) detectorRef.current.finish()
    const session: Session = { exercise, curlCountUnit:exercise==='dumbbell_curl' ? 'arm_reps' : undefined, twistCountUnit:exercise === 'russian_twist' ? 'sides' : undefined, countMode:exercise!=='squat' && exercise!=='plank' ? 'completed' : undefined, id:crypto.randomUUID(), endedAt:Date.now(), durationMs:performance.now()-sessionStartRef.current, ...detectorRef.current.getStats() }
    setHistoryFilter(exercise)
    sessionStartRef.current=0
    setSaveError('')
    try { setHistory(saveSession(session)) } catch { setSaveError('本次记录未能保存，浏览器存储可能不可用。请保留本页统计。') }
    stopCamera()
    setSummary(session)
    if(voiceEnabledRef.current) announce(exercise==='wall_sit' ? 'v18-wall-finished' : exercise==='dumbbell_curl' ? 'v17-curl-finished' : exercise==='russian_twist' ? 'v16-twist-finished' : exercise==='reverse_crunch' ? 'v15-crunch-finished' : exercise==='plank' ? 'v12-plank-finished' : session.attemptCount ? 'v5-finished' : exercise==='pushup' ? 'v8-push-empty' : 'v5-empty',true)
  }

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    poseRef.current?.close()
    poseRef.current = null
    detectorRef.current.reset()
    spokenEventRef.current = 0
    window.clearTimeout(pendingVoiceRef.current)
    audioRef.current?.pause()
    setIsRunning(false)
    setTimerOnly(false)
    setHolding(false)
    setTrackingState('IDLE')
    setSnapshot(EMPTY_SNAPSHOT)
  }, [])

  const draw = useCallback((landmarks: Array<{ x: number; y: number; visibility?: number }>) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, width, height)
    context.strokeStyle = '#7cf3d0'
    context.lineWidth = Math.max(3, width / 320)
    context.lineCap = 'round'
    for (const [start, end] of POSE_CONNECTIONS) {
      const a = landmarks[start]
      const b = landmarks[end]
      if (!a || !b || (a.visibility ?? 1) < 0.45 || (b.visibility ?? 1) < 0.45) continue
      context.beginPath()
      context.moveTo(a.x * width, a.y * height)
      context.lineTo(b.x * width, b.y * height)
      context.stroke()
    }
    context.fillStyle = '#fff'
    for (const point of landmarks) {
      if ((point.visibility ?? 1) < 0.45) continue
      context.beginPath()
      context.arc(point.x * width, point.y * height, Math.max(3, width / 430), 0, Math.PI * 2)
      context.fill()
    }
  }, [])

  const runInference = useCallback((timestamp: number) => {
    const video = videoRef.current
    const pose = poseRef.current
    if (!video || !pose || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      animationFrameRef.current = requestAnimationFrame(runInference)
      return
    }
    if (document.hidden || video.currentTime === lastFrameRef.current || timestamp-inferenceAtRef.current < inferenceGapRef.current) {
      animationFrameRef.current = requestAnimationFrame(runInference)
      return
    }
    lastFrameRef.current = video.currentTime
    inferenceAtRef.current = timestamp
    const began = performance.now()
    const result = pose.detectForVideo(video, timestamp)
    inferenceGapRef.current = Math.max(90, Math.min(350, (performance.now()-began)*2.5))
    const rawLandmarks = result.landmarks[0]
    if (rawLandmarks) {
      draw(rawLandmarks)
      const landmarks: Landmarks = {}
      for (const [index, name] of Object.entries(LANDMARK_MAP)) {
        const raw = rawLandmarks[Number(index)]
        if (raw) landmarks[name] = { ...raw, visibility: raw.visibility ?? 1 } satisfies Point
      }
      const next = detectorRef.current.update(landmarks, timestamp, video.videoWidth, video.videoHeight)
      if (timestamp - lastUiUpdateRef.current > 100) {
        lastUiUpdateRef.current = timestamp
        setSnapshot(next)
        setTrackingState(next.confidence > 0 ? 'TRACKING' : 'LOST')
      }
    } else if (timestamp - lastUiUpdateRef.current > 100) {
      lastUiUpdateRef.current = timestamp
      draw([])
      setSnapshot(detectorRef.current.update({}, timestamp))
      setTrackingState('LOST')
    }
    animationFrameRef.current = requestAnimationFrame(runInference)
  }, [draw])

  const startCamera = useCallback(async () => {
    setTimerOnly(false)
    if(voiceEnabledRef.current) announce(`${voicePrefix(exercise)}-start`, true)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('此浏览器不支持摄像头访问。请使用最新版 Chrome、Edge 或 Safari。')
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('视频预览未就绪。')
      video.srcObject = stream
      await video.play()

      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const mediaPipeBase = `${import.meta.env.BASE_URL}mediapipe/`
      const vision = await FilesetResolver.forVisionTasks(`${mediaPipeBase}wasm`)
      poseRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${mediaPipeBase}pose_landmarker_lite.task`,
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      detectorRef.current = exercise==='wall_sit' ? new WallSitDetector(plankMode==='manual' ? 'manual' : 'assisted',wallTargetSeconds*1000) : exercise==='dumbbell_curl' ? new CurlDetector() : exercise==='russian_twist' ? new TwistDetector() : exercise==='reverse_crunch' ? new ReverseCrunchDetector() : exercise==='plank' ? new PlankDetector(plankMode) : exercise==='pushup' ? new PushupDetector() : new SquatDetector()
      sessionStartRef.current=performance.now()
      setElapsed(0)
      lastUiUpdateRef.current = 0
      setIsRunning(true)
      lastFrameRef.current = -1
      animationFrameRef.current = requestAnimationFrame(runInference)
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const message = cause instanceof Error ? cause.message : '无法开启摄像头。'
      setError(`启动失败：${message}`)
    } finally {
      setIsLoading(false)
    }
  }, [announce, runInference, exercise,plankMode,wallTargetSeconds])

  const startWallTimer = () => {
    detectorRef.current = new WallSitDetector('manual',wallTargetSeconds*1000)
    sessionStartRef.current = performance.now()
    setSnapshot(detectorRef.current.snapshot('背贴墙准备好，点“开始本组”计时。'))
    setElapsed(0);setError(null);setHolding(false);setTimerOnly(true);setIsRunning(true);setTrackingState('IDLE')
    if(voiceEnabledRef.current) announce('v18-wall-start',true)
  }

  useEffect(() => stopCamera, [stopCamera])

  useEffect(() => {
    if (!isRunning) return
    if(snapshot.feedbackId && snapshot.feedbackId !== spokenEventRef.current && snapshot.cue) {
      spokenEventRef.current = snapshot.feedbackId
      announce(`${voicePrefix(exercise)}-${snapshot.cue}`)
    }
    if(trackingState==='LOST' && !isTimedExercise(exercise)) {
      const timer=window.setTimeout(()=>announce(`${voicePrefix(exercise)}-unclear`),1500)
      return ()=>window.clearTimeout(timer)
    }
  }, [announce, isRunning, trackingState, snapshot.feedbackId, snapshot.cue, exercise,plankMode])

  return (
    <main className={`app-shell ${exercise==='wall_sit' ? 'wall-sit-shell' : ''} ${isTimedExercise(exercise) && !isRunning ? 'with-modes' : ''}`}>
      <audio ref={audioRef} preload="auto" src={`${import.meta.env.BASE_URL}voice/test.mp3`} />
      <header className="topbar">
        <div><p className="eyebrow">实时动作教练</p><h1>AI 动作教练</h1></div>
        <button className="voice-toggle" disabled={isRunning || isLoading} onClick={()=>setShowHistory(true)}>训练记录</button>
      </header>
      {isTimedExercise(exercise) && !isRunning && <div className="exercise-options mode-options"><button disabled={isLoading} aria-pressed={plankMode==='assisted'} onClick={()=>setPlankMode('assisted')}>自动起表</button><button disabled={isLoading} aria-pressed={plankMode==='manual'} onClick={()=>setPlankMode('manual')}>手动起表（备用）</button>
        {exercise==='wall_sit' && <label className="wall-target">每组目标 <select aria-label="静蹲每组目标时长" value={wallTargetSeconds} disabled={isLoading} onChange={e=>setWallTargetSeconds(Number(e.target.value))}>{[10,20,30,45,60].map(n=><option key={n} value={n}>{n} 秒</option>)}</select></label>}
      </div>}

      <section className="coach-grid">
        <div className="camera-card">
          <div className={`camera-stage ${exercise!=='squat' ? 'pushup-stage' : ''} ${exercise==='wall_sit' && isRunning ? 'wall-active' : ''}`}>
            <video ref={videoRef} className="camera-feed" playsInline muted />
            <canvas ref={canvasRef} className="skeleton-canvas" aria-label="人体骨架叠加层" />
            {isRunning && timerOnly && <div className="timer-only-message"><h2>靠墙静蹲</h2><p>自主计时 · 请自己确认姿势</p><p>背贴墙，脚踩稳，保持自然呼吸。</p></div>}
            {!isRunning && <div className={`camera-placeholder exercise-picker ${exercise==='wall_sit' ? 'wall-sit-picker' : ''}`}><h2>今天想练什么？</h2><div className="exercise-options">{EXERCISES.map(kind=><button key={kind} aria-pressed={exercise===kind} disabled={isLoading} onClick={()=>{setExercise(kind);setSnapshot(EMPTY_SNAPSHOT);if(voiceEnabledRef.current) announce(`${voicePrefix(kind)}-start`,true)}}>{EXERCISE_NAMES[kind]}</button>)}</div><p>{exerciseGuidance}</p>
              {exercise==='wall_sit' && <details className="wall-sit-guide"><summary>姿势与时长指导</summary><p>背部贴墙，双脚向前站稳，脚掌踩地；膝盖朝向脚尖，避免内扣。常见姿势膝髋约90°，新手可把髋抬高一些；不要勉强蹲深。</p><p>先试20–30秒，能舒适完成再逐步加5–10秒，向60秒推进；较吃力可选10秒。组间充分休息，保持自然呼吸；出现疼痛即停止。</p><p>连续达到目标算1组，暂停后从零开始下一组；未达标也保存时长。看不清不会自动停表，休息请点暂停。镜头无法确认背部贴墙，达标仅表示计时达标。</p><a href="https://www.nasm.org/resource-center/blog/training/wall-sits" target="_blank" rel="noreferrer">动作与时长参考：NASM</a></details>}
              <small>选好运动后，点击下方“开启摄像头”</small></div>}
            {isRunning && <>
              {exercise==='plank' && plankMode!=='auto' && <button className="hold-action" onClick={()=>{const d=detectorRef.current;if(d instanceof PlankDetector){const next=!d.running;d.setRunning(next);setHolding(next);if(voiceEnabledRef.current) announce(next ? 'v12-plank-ready' : 'v12-plank-pause',true)}}}>{holding ? '暂停保持' : plankMode==='assisted' ? '手动开始／继续' : '开始保持'}</button>}
              {exercise==='wall_sit' && <div className="wall-live-controls"><button onClick={()=>{const d=detectorRef.current;if(d instanceof WallSitDetector){d.setRunning(!d.running);setHolding(d.running);setSnapshot(d.snapshot())}}}>{holding ? '暂停本组' : snapshot.attemptCount ? '开始下一组' : timerOnly || plankMode==='manual' ? '开始本组' : '手动开始本组'}</button>{snapshot.wallSit && <WallSitProgress stats={snapshot.wallSit} />}</div>}
              <div className="live-status"><span className={`dot status-${trackingState.toLowerCase()}`} />{EXERCISE_NAMES[exercise]} · {timerOnly ? '自主计时' : TRACKING_LABELS[trackingState]}</div>
              <div className="training-hud" aria-label="训练数据">
                <div className="hud-reps"><span>{countLabel}</span><strong>{isTimedExercise(exercise) ? `${Math.floor((snapshot.hold?.heldMs ?? 0)/1000)}秒` : snapshot.repCount}</strong><small>{exercise==='wall_sit' ? `达标 ${snapshot.repCount} / 尝试 ${snapshot.attemptCount} 组` : exercise==='dumbbell_curl' ? `左手 ${snapshot.armCounts?.left ?? 0} · 右手 ${snapshot.armCounts?.right ?? 0}` : exercise==='russian_twist' ? '左一下＋1，右一下＋1' : exercise==='reverse_crunch' ? '收膝放回＋1' : exercise==='plank' ? `中断 ${snapshot.hold?.breaks ?? 0} 次` : `尝试 ${snapshot.attemptCount} 次`}</small></div>
                <div className="hud-metrics"><span><b>动作</b>{phaseLabels[snapshot.phase]}</span><span><b>用时</b>{duration(elapsed)}</span></div>
              </div>
              <div className="coach-cue"><small>{exercise==='wall_sit' ? '连续计时达标 · 休息请点暂停' : exercise==='plank' ? plankMode==='assisted' ? '自动起表 · 休息请点暂停' : '自主计时 · 不代表动作已合格' : exercise==='pushup' ? '上半身计数 · 幅度单独点评' : '教练提示'}</small><strong>{snapshot.feedback}</strong></div>
            </>}
          </div>
          <div className="camera-controls">
            <div className="control-actions">
              {isRunning ? <button className="secondary" onClick={finishTraining}>结束训练</button> : <button onClick={startCamera} disabled={isLoading}>{isLoading ? '正在准备…' : '开启摄像头'}</button>}
              <button className="voice-toggle" onClick={() => {
                const enabled = !voiceEnabledRef.current
                voiceEnabledRef.current = enabled
                setVoiceEnabled(enabled)
                announce(enabled ? 'on' : 'off', true)
              }} aria-pressed={voiceEnabled}>语音：{voiceEnabled ? '开' : '关'}</button>
              <button className="voice-toggle" onClick={() => announce('test', true)}>试听</button>
            </div>
            <p>镜头识别与计数均在手机本地完成。</p>
          </div>
          {exercise==='wall_sit' && !isRunning && <button className="timer-only-start voice-toggle" disabled={isLoading} onClick={startWallTimer}>仅计时（无需摄像头）</button>}
          <p className="voice-status" role="status">{voiceStatus}</p>
          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <aside className="debug-panel" aria-label="动作技术详情">
          <div className="panel-heading"><div><p className="eyebrow">动作数据</p><h2>训练技术详情</h2></div><span className="exercise-tag">{EXERCISE_NAMES[exercise]}</span></div>
          <div className="phase-card"><span>当前阶段</span><strong>{phaseLabels[snapshot.phase]}</strong><p>{snapshot.feedback}</p></div>
          <div className="rep-row"><div><span>{countLabel}</span><strong>{isTimedExercise(exercise) ? duration(snapshot.hold?.heldMs ?? 0) : snapshot.repCount}</strong></div><div><span>{isTimedExercise(exercise) ? '最长连续' : '尝试次数'}</span><strong>{isTimedExercise(exercise) ? duration(snapshot.hold?.bestMs ?? 0) : snapshot.attemptCount}</strong></div></div>
          {exercise==='wall_sit' && <p>每组目标 {wallTargetSeconds} 秒 · 达标 {snapshot.repCount} 组</p>}
          <dl className="metrics">
            {exercise==='dumbbell_curl' ? <>
              <div><dt>左手 · 肘角</dt><dd>{snapshot.armCounts?.left ?? 0} 次 · {metric(snapshot.elbowAngles?.left ?? null,'°')}</dd></div>
              <div><dt>右手 · 肘角</dt><dd>{snapshot.armCounts?.right ?? 0} 次 · {metric(snapshot.elbowAngles?.right ?? null,'°')}</dd></div>
              <div><dt>可见范围</dt><dd>{snapshot.trackingReason ?? '尚未开始'}</dd></div>
            </> : <>
              <div><dt>{exercise==='pushup' ? '可见侧肘角' : exercise==='russian_twist' || exercise==='reverse_crunch' ? '动作状态' : '平均膝角'}</dt><dd>{exercise==='russian_twist' || exercise==='reverse_crunch' ? phaseLabels[snapshot.phase] : metric(exercise==='pushup' ? snapshot.averageElbowAngle ?? null : snapshot.averageKneeAngle, '°')}</dd></div>
              <div><dt>{exercise==='russian_twist' ? '手部横向幅度' : exercise==='reverse_crunch' ? '膝肩距离比' : '髋位移'}</dt><dd>{metric(snapshot.hipDisplacement === null ? null : snapshot.hipDisplacement * (exercise==='reverse_crunch' ? 1 : 100), exercise==='reverse_crunch' ? '' : '%')}</dd></div>
            </>}
            <div><dt>关键点置信度</dt><dd>{metric(snapshot.confidence * 100, '%')}</dd></div>
          </dl>
          <div className="threshold-note"><strong>观察范围与节奏</strong><p>{exercise==='dumbbell_curl' ? '左右指你的身体左右，不是镜像画面的左右。每只手弯起再放回各计一次；仅依据可见肘角和节奏，不识别重量、手腕姿态或肌肉发力。' : '侧身入镜更容易观察。当前反馈依据动作幅度、完成度和用时，不能代表完整动作标准评估。'}</p></div>
        </aside>
      </section>
      <dialog ref={dialogRef} className="session-dialog" onCancel={()=>{setSummary(null);setShowHistory(false)}}>
        <div className="panel-heading"><h2>{summary ? summary.exercise==='wall_sit' ? '本次训练完成' : '本组训练完成' : '训练记录'}</h2><button className="voice-toggle" onClick={()=>{setSummary(null);setShowHistory(false)}}>关闭</button></div>
        {summary ? <>
          <p className="summary-lead">{EXERCISE_NAMES[summary.exercise]} · {isTimedExercise(summary.exercise) ? summary.hold?.timerMode==='assisted' ? '自动起表记录' : summary.hold?.timerMode==='manual' ? '自主计时记录' : '自动识别记录' : '每一次认真完成，都算进步。'}</p>
          <div className="rep-row"><div><span>{isTimedExercise(summary.exercise) ? '累计保持' : summary.exercise==='russian_twist' || summary.exercise==='reverse_crunch' ? '完成次数' : summary.countMode==='completed' ? '完成次数' : summary.exercise==='pushup' ? '有效次数（旧规则）' : '有效次数'}</span><strong>{isTimedExercise(summary.exercise) ? duration(summary.hold?.heldMs ?? 0) : summary.repCount}</strong></div><div><span>{isTimedExercise(summary.exercise) ? '最长连续' : '尝试次数'}</span><strong>{isTimedExercise(summary.exercise) ? duration(summary.hold?.bestMs ?? 0) : summary.attemptCount}</strong></div><div><span>训练用时</span><strong>{duration(summary.durationMs)}</strong></div></div>
          {summary.exercise==='wall_sit' && <div className="wall-sit-history"><p>每组目标 {(summary.wallSit?.targetMs ?? 20000)/1000} 秒 · 达标 {summary.repCount} / 尝试 {summary.attemptCount} 组</p>{summary.wallSit?.sets.map((set,i)=><p key={i}>第 {i+1} 组：{duration(set.heldMs)} · {set.completed ? '计时达标' : '未达目标'}</p>)}</div>}
          <p className="review-text">{review(summary)}</p>
          {summary.exercise==='dumbbell_curl' && <p>左手 {summary.armCounts?.left ?? 0} 次 · 右手 {summary.armCounts?.right ?? 0} 次 · 每只手各计一次</p>}
          {!isTimedExercise(summary.exercise) && <p>完整观察 {summary.records.length} 次 · 幅度偏小 {summary.records.filter(r=>r.issue==='shallow').length} 次 · 节奏偏快 {summary.records.filter(r=>r.issue==='fast').length} 次</p>}
          <p className="history-note">{summary.exercise==='wall_sit' ? '每次连续保持达到所选目标仅计1组，休息后重新起表；未达目标也保存实际时长。开始后看不清不扣时，休息请手动暂停，切到后台也会暂停。摄像头不能确认贴墙和完整姿势。' : summary.exercise==='dumbbell_curl' ? '双手同时弯起再放下一轮共计两次；仅看清一侧时只记录该手。未记录重量，不认证完整动作标准。' : summary.exercise==='russian_twist' ? '左、右每侧到位各计一次，根据手部轨迹估计完成量，不能确认躯干旋转和腰背姿态是否标准。' : summary.exercise==='reverse_crunch' ? '收膝并放回计一次；画面不能确认骨盆抬起和腰背姿态是否标准。' : summary.exercise==='plank' ? summary.hold?.timerMode==='assisted' || summary.hold?.timerMode==='manual' ? '起表后连续计时，摄像头丢失不会扣时。休息请手动暂停，切到后台也会暂停。此时长不是动作质量认证。' : '旧版自动时长只累计看清支撑的时间，可能漏记；局部画面不能确认腰腿姿态。旧记录保留当时结果。' : summary.countMode==='completed' ? '完成次数表示观察到下压与推回，幅度偏小仍计入完成次数。上半身画面不能评价腰腿姿态。' : '有效次数按当时的幅度规则统计，旧记录不重新计算。'}训练用时包含组内休息。</p>
          {saveError ? <p role="alert" className="error">{saveError}</p> : <p className="history-note">已保存到当前浏览器。</p>}
          <button onClick={()=>{setSummary(null);setShowHistory(true)}}>查看历史记录</button>
        </> : <>
          <ActivityHeatmap sessions={history} />
          <div className="exercise-options">{EXERCISES.map(kind=><button key={kind} aria-pressed={historyFilter===kind} onClick={()=>setHistoryFilter(kind)}>{EXERCISE_NAMES[kind]}</button>)}</div>
          <div className="rep-row"><div><span>今日{isTimedExercise(historyFilter) ? '保持时长' : `${EXERCISE_NAMES[historyFilter]}次数`}</span><strong>{isTimedExercise(historyFilter) ? duration(filteredHistory.filter(s=>new Date(s.endedAt).toDateString()===new Date().toDateString()).reduce((n,s)=>n+(s.hold?.heldMs ?? 0),0)) : filteredHistory.filter(s=>new Date(s.endedAt).toDateString()===new Date().toDateString()).reduce((n,s)=>n+s.repCount,0)}</strong></div><div><span>累计训练</span><strong>{filteredHistory.length} {historyFilter==='wall_sit' ? '次训练' : '组'}</strong></div><div><span>累计用时</span><strong>{duration(filteredHistory.reduce((n,s)=>n+s.durationMs,0))}</strong></div></div>
          {historyFilter==='wall_sit' && <WallSitHistoryProgress sessions={filteredHistory} />}
          <p className="history-note">记录仅保存在当前手机的这个浏览器中。更换浏览器或清理网站数据后不会保留。</p>
          {historyFilter==='dumbbell_curl' && <p className="history-note">统计单位：每只手各计一次；双手一轮共两次。左手累计 {filteredHistory.reduce((n,s)=>n+(s.armCounts?.left ?? 0),0)} 次，右手累计 {filteredHistory.reduce((n,s)=>n+(s.armCounts?.right ?? 0),0)} 次。</p>}
          <div className="history-export"><button type="button" disabled={!history.length} onClick={()=>{try { downloadHistoryExport(readHistory()); setExportStatus(`已生成全部 ${history.length} 组记录的 JSON 文件。靠墙静蹲需配套导入器支持 wall_sit 后才能导入 Fitness OS。`) } catch { setExportStatus('导出失败，请检查浏览器的下载权限后重试。') }}}>导出全部训练记录</button><p className="history-note">导出包含所有运动，不受上方筛选影响；保留记录编号、次数、保持毫秒时长、静蹲目标及逐组结果、转体每侧单位及弯举左右手次数与单位。</p></div>
          {exportStatus && <p role="status" className="history-note">{exportStatus}</p>}
          {!filteredHistory.length && <p className="review-text">还没有{EXERCISE_NAMES[historyFilter]}记录。完成一组后，点击“结束训练”即可保存。</p>}
          {filteredHistory.map(s=><button className="history-entry" key={s.id} onClick={()=>{setSaveError('');setSummary(s)}}><span>{EXERCISE_NAMES[s.exercise]} · {new Date(s.endedAt).toLocaleString('zh-CN')}</span><strong>{s.exercise==='wall_sit' ? `达标 ${s.repCount}/${s.attemptCount} 组 · 保持 ${duration(s.hold?.heldMs ?? 0)} · 最长 ${duration(s.hold?.bestMs ?? 0)}` : s.exercise==='dumbbell_curl' ? `左手 ${s.armCounts?.left ?? 0} · 右手 ${s.armCounts?.right ?? 0} · 共 ${s.repCount} 次` : s.exercise==='plank' ? `保持 ${duration(s.hold?.heldMs ?? 0)} · 中断 ${s.hold?.breaks ?? 0} 次` : `${s.repCount} 次${s.countMode==='completed' ? '完成' : '有效'} / ${s.attemptCount} 次尝试`} · {duration(s.durationMs)}</strong><small>查看本组点评 →</small></button>)}
        </>}
      </dialog>
    </main>
  )
}
