import { useCallback, useEffect, useRef, useState } from 'react'
import type { Landmarks, Point, SquatSnapshot, TrackingState } from './types'
import { SquatDetector } from './coachDetector'
import { PushupDetector } from './pushupDetector'
import { PlankDetector } from './plankDetector'
import { TwistDetector } from './twistDetector'
import { ReverseCrunchDetector } from './reverseCrunchDetector'
import { ActivityHeatmap } from './ActivityHeatmap'
import { EXERCISE_NAMES, type Exercise } from './types'
import { readHistory, saveSession, review, duration, type Session } from './history'

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
const voicePrefix=(exercise:Exercise)=>exercise==='russian_twist' ? 'v16-twist' : exercise==='reverse_crunch' ? 'v15-crunch' : exercise==='plank' ? 'v12-plank' : exercise==='pushup' ? 'v8-push' : 'v5'

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
  const detectorRef = useRef<SquatDetector | PushupDetector | PlankDetector | TwistDetector | ReverseCrunchDetector>(new SquatDetector())
  const [exercise, setExercise] = useState<Exercise>('squat')
  const [historyFilter, setHistoryFilter] = useState<Exercise>('squat')
  const [plankMode,setPlankMode]=useState<'manual'|'auto'|'assisted'>('assisted')
  const [holding,setHolding]=useState(false)
  const phaseLabels = exercise==='russian_twist' ? {WAITING:'准备转体',STANDING:'左右转体',DESCENDING:'转向一侧',BOTTOM:'一侧到位',ASCENDING:'转向另一侧'} : exercise==='reverse_crunch' ? {WAITING:'准备伸腿',STANDING:'腿放远',DESCENDING:'收膝',BOTTOM:'已收膝',ASCENDING:'放回'} : exercise==='plank' ? {WAITING:'准备／暂停',STANDING:'正在保持',DESCENDING:'调整姿势',BOTTOM:'调整姿势',ASCENDING:'调整姿势'} : exercise==='squat' ? PHASE_LABELS : { WAITING:'准备支撑', STANDING:'高位支撑', DESCENDING:'正在下放', BOTTOM:'动作低位', ASCENDING:'正在推起' }
  const guidance = exercise==='russian_twist' ? '坐好并正对镜头，让肩、髋和至少一只手入镜，不需要拍到脚。双手随身体向左右移动；左、右每侧到位各计一次。镜头提示会说明看不清哪个部位。' : exercise==='reverse_crunch' ? '手机固定在身体侧面，拍到肩、髋和至少一侧膝盖。仰卧后先把腿放远，再缓慢收膝、放回；收膝并放回计一次。' : exercise==='plank' ? '默认自动起表：开启摄像头后摆好前臂支撑，听到“开始计时”即可。开始后短暂看不清不会扣时；休息请点“暂停保持”。计时不代表动作合格，只拍上半身时无法确认腰腿姿态。' : exercise==='squat' ? '手机放稳，从身体侧面拍摄，让髋、膝盖和脚完整入镜。先站稳，再开始深蹲。' : '正面或侧面拍摄均可，让肩、肘和手腕清晰入镜，不必拍到脚。手机放稳，正常下压再推回，无需停顿校准。'
  const streamRef = useRef<MediaStream | null>(null)
  const lastUiUpdateRef = useRef(0)
  const lastFrameRef = useRef(-1)
  const inferenceAtRef = useRef(0)
  const inferenceGapRef = useRef(90)
  const spokenEventRef = useRef(0)
  const lastSpokenRef = useRef({ text: '', time: 0 })
  const [isRunning, setIsRunning] = useState(false)
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
    },250)
    const pauseOnHide=()=>{const d=detectorRef.current;if(document.hidden && d instanceof PlankDetector && d.running){d.setRunning(false);setHolding(false)}}
    document.addEventListener('visibilitychange',pauseOnHide)
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',pauseOnHide)}
  }, [isRunning])

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
    const session: Session = { exercise, twistCountUnit:exercise === 'russian_twist' ? 'sides' : undefined, countMode:exercise==='pushup' || exercise==='russian_twist' || exercise==='reverse_crunch' ? 'completed' : undefined, id:crypto.randomUUID(), endedAt:Date.now(), durationMs:performance.now()-sessionStartRef.current, ...detectorRef.current.getStats() }
    setHistoryFilter(exercise)
    sessionStartRef.current=0
    setSaveError('')
    try { setHistory(saveSession(session)) } catch { setSaveError('本次记录未能保存，浏览器存储可能不可用。请保留本页统计。') }
    stopCamera()
    setSummary(session)
    if(voiceEnabledRef.current) announce(exercise==='russian_twist' ? 'v16-twist-finished' : exercise==='reverse_crunch' ? 'v15-crunch-finished' : exercise==='plank' ? 'v12-plank-finished' : session.attemptCount ? 'v5-finished' : exercise==='pushup' ? 'v8-push-empty' : 'v5-empty',true)
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
      detectorRef.current = exercise==='russian_twist' ? new TwistDetector() : exercise==='reverse_crunch' ? new ReverseCrunchDetector() : exercise==='plank' ? new PlankDetector(plankMode) : exercise==='pushup' ? new PushupDetector() : new SquatDetector()
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
  }, [announce, runInference, exercise,plankMode])

  useEffect(() => stopCamera, [stopCamera])

  useEffect(() => {
    if (!isRunning) return
    if(snapshot.feedbackId && snapshot.feedbackId !== spokenEventRef.current && snapshot.cue) {
      spokenEventRef.current = snapshot.feedbackId
      announce(`${voicePrefix(exercise)}-${snapshot.cue}`)
    }
    if(trackingState==='LOST' && !(exercise==='plank' && plankMode!=='auto')) {
      const timer=window.setTimeout(()=>announce(`${voicePrefix(exercise)}-unclear`),1500)
      return ()=>window.clearTimeout(timer)
    }
  }, [announce, isRunning, trackingState, snapshot.feedbackId, snapshot.cue, exercise,plankMode])

  return (
    <main className={`app-shell ${exercise==='plank' && !isRunning ? 'with-modes' : ''}`}>
      <audio ref={audioRef} preload="auto" src={`${import.meta.env.BASE_URL}voice/test.mp3`} />
      <header className="topbar">
        <div><p className="eyebrow">实时动作教练</p><h1>AI 动作教练</h1></div>
        <button className="voice-toggle" disabled={isRunning || isLoading} onClick={()=>setShowHistory(true)}>训练记录</button>
      </header>
      {exercise==='plank' && !isRunning && <div className="exercise-options mode-options"><button disabled={isLoading} aria-pressed={plankMode==='assisted'} onClick={()=>setPlankMode('assisted')}>自动起表</button><button disabled={isLoading} aria-pressed={plankMode==='manual'} onClick={()=>setPlankMode('manual')}>手动起表（备用）</button></div>}

      <section className="coach-grid">
        <div className="camera-card">
          <div className={`camera-stage ${exercise!=='squat' ? 'pushup-stage' : ''}`}>
            <video ref={videoRef} className="camera-feed" playsInline muted />
            <canvas ref={canvasRef} className="skeleton-canvas" aria-label="人体骨架叠加层" />
            {!isRunning && <div className="camera-placeholder exercise-picker"><h2>今天想练什么？</h2><div className="exercise-options">{(['squat','pushup','plank','russian_twist','reverse_crunch'] as const).map(kind=><button key={kind} aria-pressed={exercise===kind} disabled={isLoading} onClick={()=>{setExercise(kind);setSnapshot(EMPTY_SNAPSHOT);if(voiceEnabledRef.current) announce(`${voicePrefix(kind)}-start`,true)}}>{EXERCISE_NAMES[kind]}</button>)}</div><p>{guidance}</p><small>选好运动后，点击下方“开启摄像头”</small></div>}
            {isRunning && <>
              {exercise==='plank' && plankMode!=='auto' && <button className="hold-action" onClick={()=>{const d=detectorRef.current;if(d instanceof PlankDetector){const next=!d.running;d.setRunning(next);setHolding(next);if(voiceEnabledRef.current) announce(next ? 'v12-plank-ready' : 'v12-plank-pause',true)}}}>{holding ? '暂停保持' : plankMode==='assisted' ? '手动开始／继续' : '开始保持'}</button>}
              <div className="live-status"><span className={`dot status-${trackingState.toLowerCase()}`} />{EXERCISE_NAMES[exercise]} · {TRACKING_LABELS[trackingState]}</div>
              <div className="training-hud" aria-label="训练数据">
                <div className="hud-reps"><span>{exercise==='russian_twist' || exercise==='reverse_crunch' ? '完成次数' : exercise==='plank' ? '累计保持' : exercise==='pushup' ? '完成次数' : '有效次数'}</span><strong>{exercise==='plank' ? `${Math.floor((snapshot.hold?.heldMs ?? 0)/1000)}秒` : snapshot.repCount}</strong><small>{exercise==='russian_twist' ? '左一下＋1，右一下＋1' : exercise==='reverse_crunch' ? '收膝放回＋1' : exercise==='plank' ? `中断 ${snapshot.hold?.breaks ?? 0} 次` : `尝试 ${snapshot.attemptCount} 次`}</small></div>
                <div className="hud-metrics"><span><b>动作</b>{phaseLabels[snapshot.phase]}</span><span><b>用时</b>{duration(elapsed)}</span></div>
              </div>
              <div className="coach-cue"><small>{exercise==='plank' ? plankMode==='assisted' ? '自动起表 · 休息请点暂停' : '自主计时 · 不代表动作已合格' : exercise==='pushup' ? '上半身计数 · 幅度单独点评' : '教练提示'}</small><strong>{snapshot.feedback}</strong></div>
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
          <p className="voice-status" role="status">{voiceStatus}</p>
          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <aside className="debug-panel" aria-label="动作技术详情">
          <div className="panel-heading"><div><p className="eyebrow">动作数据</p><h2>训练技术详情</h2></div><span className="exercise-tag">{EXERCISE_NAMES[exercise]}</span></div>
          <div className="phase-card"><span>当前阶段</span><strong>{phaseLabels[snapshot.phase]}</strong><p>{snapshot.feedback}</p></div>
          <div className="rep-row"><div><span>{exercise==='russian_twist' || exercise==='reverse_crunch' ? '完成次数' : exercise==='plank' ? '累计保持' : exercise==='pushup' ? '完成次数' : '有效次数'}</span><strong>{exercise==='plank' ? duration(snapshot.hold?.heldMs ?? 0) : snapshot.repCount}</strong></div><div><span>{exercise==='plank' ? '最长连续' : '尝试次数'}</span><strong>{exercise==='plank' ? duration(snapshot.hold?.bestMs ?? 0) : snapshot.attemptCount}</strong></div></div>
          <dl className="metrics">
            <div><dt>{exercise==='pushup' ? '可见侧肘角' : exercise==='russian_twist' || exercise==='reverse_crunch' ? '动作状态' : '平均膝角'}</dt><dd>{exercise==='russian_twist' || exercise==='reverse_crunch' ? phaseLabels[snapshot.phase] : metric(exercise==='pushup' ? snapshot.averageElbowAngle ?? null : snapshot.averageKneeAngle, '°')}</dd></div>
            <div><dt>{exercise==='russian_twist' ? '手部横向幅度' : exercise==='reverse_crunch' ? '膝肩距离比' : '髋位移'}</dt><dd>{metric(snapshot.hipDisplacement === null ? null : snapshot.hipDisplacement * (exercise==='reverse_crunch' ? 1 : 100), exercise==='reverse_crunch' ? '' : '%')}</dd></div>
            <div><dt>关键点置信度</dt><dd>{metric(snapshot.confidence * 100, '%')}</dd></div>
          </dl>
          <div className="threshold-note"><strong>观察范围与节奏</strong><p>侧身入镜更容易观察。当前反馈依据动作幅度、完成度和用时，不能代表完整动作标准评估。</p></div>
        </aside>
      </section>
      <dialog ref={dialogRef} className="session-dialog" onCancel={()=>{setSummary(null);setShowHistory(false)}}>
        <div className="panel-heading"><h2>{summary ? '本组训练完成' : '训练记录'}</h2><button className="voice-toggle" onClick={()=>{setSummary(null);setShowHistory(false)}}>关闭</button></div>
        {summary ? <>
          <p className="summary-lead">{EXERCISE_NAMES[summary.exercise]} · {summary.exercise==='plank' ? summary.hold?.timerMode==='assisted' ? '自动起表记录' : summary.hold?.timerMode==='manual' ? '自主计时记录' : '自动识别记录' : '每一次认真完成，都算进步。'}</p>
          <div className="rep-row"><div><span>{summary.exercise==='plank' ? '累计保持' : summary.exercise==='russian_twist' || summary.exercise==='reverse_crunch' ? '完成次数' : summary.countMode==='completed' ? '完成次数' : summary.exercise==='pushup' ? '有效次数（旧规则）' : '有效次数'}</span><strong>{summary.exercise==='plank' ? duration(summary.hold?.heldMs ?? 0) : summary.repCount}</strong></div><div><span>{summary.exercise==='plank' ? '最长连续' : '尝试次数'}</span><strong>{summary.exercise==='plank' ? duration(summary.hold?.bestMs ?? 0) : summary.attemptCount}</strong></div><div><span>训练用时</span><strong>{duration(summary.durationMs)}</strong></div></div>
          <p className="review-text">{review(summary)}</p>
          {summary.exercise!=='plank' && <p>完整观察 {summary.records.length} 次 · 幅度偏小 {summary.records.filter(r=>r.issue==='shallow').length} 次 · 节奏偏快 {summary.records.filter(r=>r.issue==='fast').length} 次</p>}
          <p className="history-note">{summary.exercise==='russian_twist' ? '左、右每侧到位各计一次，根据手部轨迹估计完成量，不能确认躯干旋转和腰背姿态是否标准。' : summary.exercise==='reverse_crunch' ? '收膝并放回计一次；画面不能确认骨盆抬起和腰背姿态是否标准。' : summary.exercise==='plank' ? summary.hold?.timerMode==='assisted' || summary.hold?.timerMode==='manual' ? '起表后连续计时，摄像头丢失不会扣时。休息请手动暂停，切到后台也会暂停。此时长不是动作质量认证。' : '旧版自动时长只累计看清支撑的时间，可能漏记；局部画面不能确认腰腿姿态。旧记录保留当时结果。' : summary.countMode==='completed' ? '完成次数表示观察到下压与推回，幅度偏小仍计入完成次数。上半身画面不能评价腰腿姿态。' : '有效次数按当时的幅度规则统计，旧记录不重新计算。'}训练用时包含组内休息。</p>
          {saveError ? <p role="alert" className="error">{saveError}</p> : <p className="history-note">已保存到当前浏览器。</p>}
          <button onClick={()=>{setSummary(null);setShowHistory(true)}}>查看历史记录</button>
        </> : <>
          <ActivityHeatmap sessions={history} />
          <div className="exercise-options">{(['squat','pushup','plank','russian_twist','reverse_crunch'] as const).map(kind=><button key={kind} aria-pressed={historyFilter===kind} onClick={()=>setHistoryFilter(kind)}>{EXERCISE_NAMES[kind]}</button>)}</div>
          <div className="rep-row"><div><span>今日{historyFilter==='plank' ? '保持时长' : `${EXERCISE_NAMES[historyFilter]}次数`}</span><strong>{historyFilter==='plank' ? duration(filteredHistory.filter(s=>new Date(s.endedAt).toDateString()===new Date().toDateString()).reduce((n,s)=>n+(s.hold?.heldMs ?? 0),0)) : filteredHistory.filter(s=>new Date(s.endedAt).toDateString()===new Date().toDateString()).reduce((n,s)=>n+s.repCount,0)}</strong></div><div><span>累计训练</span><strong>{filteredHistory.length} 组</strong></div><div><span>累计用时</span><strong>{duration(filteredHistory.reduce((n,s)=>n+s.durationMs,0))}</strong></div></div>
          <p className="history-note">记录仅保存在当前手机的这个浏览器中。更换浏览器或清理网站数据后不会保留。</p>
          {!filteredHistory.length && <p className="review-text">还没有{EXERCISE_NAMES[historyFilter]}记录。完成一组后，点击“结束训练”即可保存。</p>}
          {filteredHistory.map(s=><button className="history-entry" key={s.id} onClick={()=>{setSaveError('');setSummary(s)}}><span>{EXERCISE_NAMES[s.exercise]} · {new Date(s.endedAt).toLocaleString('zh-CN')}</span><strong>{s.exercise==='plank' ? `保持 ${duration(s.hold?.heldMs ?? 0)} · 中断 ${s.hold?.breaks ?? 0} 次` : `${s.repCount} 次${s.countMode==='completed' ? '完成' : '有效'} / ${s.attemptCount} 次尝试`} · {duration(s.durationMs)}</strong><small>查看本组点评 →</small></button>)}
        </>}
      </dialog>
    </main>
  )
}
