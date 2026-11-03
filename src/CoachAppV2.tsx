import { WeekStrip, RecentExercises, QualityStrip } from './BrightUI'
import { historyOverview } from './workoutMetrics'
import { useMemo, useRef, useState } from 'react'
import { ExerciseIcon, Icon } from './CoachIcons'
import { SyncPanel } from './SyncPanel'
import { TrainingHistory } from './TrainingHistory'
import { WorkoutSummary } from './WorkoutSummary'
import { HoldToFinish } from './HoldToFinish'
import { useWorkout } from './useWorkout'
import { EXERCISE_NAMES, isTimedExercise, type Exercise } from './types'
import { duration, readHistory, type Session } from './history'
import { downloadHistoryExport } from './historyExport'
import { readDraft, saveDraft, type WorkoutDraft } from './localWorkout'
import { deltaLabel, previousSession, quality, recommendation, QUALITY_NOTE, type TrainingPlan } from './workoutMetrics'

const GROUPS:{name:string;exercises:Exercise[]}[]=[{name:'腿部',exercises:['squat','wall_sit']},{name:'核心',exercises:['plank','reverse_crunch','russian_twist']},{name:'上肢',exercises:['pushup','dumbbell_curl']}]
const angleLabel=(e:Exercise)=>e==='russian_twist'?'正面拍摄':'侧面拍摄'
function syncDisplay(text:string){
  if(/等待联网/.test(text))return {label:'待同步（离线）',kind:'offline',retry:true}
  if(/失败|无效|无法|不足|异常|不正确|不完整|超过|未能|暂未|重试/.test(text))return {label:'同步失败',kind:'error',retry:true}
  if(/正在|准备/.test(text))return {label:'同步中',kind:'busy',retry:true}
  return {label:'',kind:text.startsWith('云端已同步')?'ok':'local',retry:false}
}
function localGoal(){try{return Math.max(1,Math.min(7,Number(localStorage.getItem('motion-coach.week-goal.v2'))||5))}catch{return 5}}

export default function CoachAppV2(){
  const [history,setHistory]=useState(readHistory),[exercise,setExercise]=useState<Exercise>('squat')
  const [page,setPage]=useState<'train'|'history'|'settings'>('train'),[planOverride,setPlanOverride]=useState<TrainingPlan|null>(null)
  const [pending,setPending]=useState<WorkoutDraft|null>(readDraft),[summary,setSummary]=useState<WorkoutDraft|null>(null),[summarySaved,setSummarySaved]=useState(false)
  const [saveError,setSaveError]=useState(''),[notice,setNotice]=useState(''),[syncStatus,setSyncStatus]=useState('准备同步'),[weeklyTarget,setWeeklyTarget]=useState(localGoal)
  const syncArea=useRef<HTMLDivElement>(null),saving=useRef(false)
  const plan=useMemo(()=>planOverride??recommendation(history,exercise),[planOverride,history,exercise])
  const previous=previousSession(history,exercise),previousQuality=previous?quality([previous]).percent:null
  const coach=useWorkout((draft,finished)=>{setPending(draft);if(finished){setSummary(draft);setSummarySaved(false);setSaveError('');window.scrollTo(0,0)}})
  const view=coach.view,running=!!view&&view.stage!=='summary',timed=isTimedExercise(exercise),sync=syncDisplay(syncStatus)
  const choose=(kind:Exercise)=>{setExercise(kind);setPlanOverride(null)}
  const begin=(timerOnly=false)=>{if(pending){setSummary(pending);setSummarySaved(false);return}void coach.start(exercise,plan,timerOnly)}
  const retrySync=()=>{
    const buttons=[...(syncArea.current?.querySelectorAll('button')??[])]
    const retry=buttons.find(button=>button.textContent==='立即同步')
    if(retry&&!retry.disabled)retry.click()
    else if(sync.kind!=='busy'){setPage('settings');const details=syncArea.current?.querySelector('details');if(details)details.open=true}
  }
  const save=()=>{
    if(!summary||saving.current)return;saving.current=true
    try{setHistory(saveDraft(summary));setPending(null);setSummary(null);setSummarySaved(false);coach.clear();setPage('history');setSaveError('');window.scrollTo(0,0)}
    catch{setSaveError('保存未完成，请保持本页并重试；已保存的组会按同一编号去重，不会重复增加。')}
    finally{saving.current=false}
  }
  const openHistory=(session:Session)=>{setSummary({id:session.id,exercise:session.exercise,plan:{sets:1,target:isTimedExercise(session.exercise)?Math.round((session.hold?.heldMs??0)/1000):session.repCount,restSeconds:0},sessions:[session],createdAt:session.endedAt,replayIds:[session.id],ruleCounts:{}});setSummarySaved(true);setSaveError('');window.scrollTo(0,0)}
  const exportHistory=()=>{try{const records=readHistory();downloadHistoryExport(records);setNotice(`已导出 ${records.length} 条训练记录；回放画面不包含在导出或同步数据中。`)}catch{setNotice('导出失败，请检查下载权限后重试')}}
  const overview=historyOverview(history,new Date(),weeklyTarget)
  const records=view?.snapshot.records??[]
  const liveQuality=records.length?Math.round(records.filter(r=>r.valid&&!r.issue).length/records.length*100):null
  const mutatePlan=(patch:Partial<TrainingPlan>)=>setPlanOverride({...plan,...patch})
  return <main className={`app-shell v2 b2 ${running?'is-training':'is-idle'} ${summary?'summary-mode':''}`}>
    <audio ref={coach.audioRef} preload="auto" src={`${import.meta.env.BASE_URL}voice/test.mp3`} />
    <header className="topbar" hidden={!!summary}>
      <>{running&&<button className="training-back" aria-label="返回并暂停训练" onClick={coach.pause}><Icon name="arrow"/></button>}<h1>{running?`${EXERCISE_NAMES[exercise]} · 第 ${view.group}/${plan.sets} 组`:<><small>本周 · {overview.weekDays} / {weeklyTarget} 天</small><span>{page==='train'?'今日训练':'AI 动作教练'}</span></>}</h1></>
      {running?<button className="voice-toggle" onClick={coach.toggleVoice} aria-pressed={coach.voiceEnabled}><Icon name="sound"/>语音{coach.voiceEnabled?'开':'关'}</button>:<div className="sync-status-mini"><button className={`sync-dot-button ${sync.kind}`} title={syncStatus} aria-label={syncStatus} disabled={coach.loading} onClick={()=>setPage('settings')}><span className="sync-dot"/>{sync.label&&<span>{sync.label}</span>}</button>{sync.retry&&<button className="sync-retry" disabled={sync.kind==='busy'} onClick={retrySync}>重试</button>}</div>}
    </header>
    {/* Always mounted: moving UI must not change the existing sync worker lifecycle. */}
    <section className="settings-page" hidden={page!=='settings'||running||!!summary} aria-label="设置">
      <div className="page-heading"><h2>设置</h2></div>
      <section className="settings-card"><h3>教练语音</h3><div className="setting-actions"><button className="secondary" onClick={coach.toggleVoice} aria-pressed={coach.voiceEnabled}>语音：{coach.voiceEnabled?'开':'关'}</button><button className="secondary" onClick={coach.testVoice}>试听</button></div><p role="status">{coach.voiceStatus}</p></section>
      <div ref={syncArea}><SyncPanel onSynced={()=>setHistory(readHistory())} onStatusChange={setSyncStatus} disabled={running||coach.loading}/></div>
      <section className="settings-card"><h3>训练目标</h3><label className="weekly-goal">每周训练天数<select value={weeklyTarget} onChange={e=>{const value=Number(e.target.value);try{localStorage.setItem('motion-coach.week-goal.v2',String(value));setWeeklyTarget(value)}catch{setNotice('暂时无法保存本机目标')}}}>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n} 天</option>)}</select></label><p>这是可调整的记录目标，不是个性化运动处方。</p></section>
      <section className="settings-card"><h3>数据与隐私</h3><p>画面仅在本机识别，不会上传。回放只保留在当前浏览器；统计记录沿用原有云端同步。</p><button className="secondary" onClick={exportHistory} disabled={!history.length}><Icon name="export"/>导出全部训练记录</button><p>{QUALITY_NOTE}</p></section>
      {notice&&<p className="notice" role="status">{notice}</p>}
    </section>
    {summary&&<WorkoutSummary draft={summary} history={history} saved={summarySaved} onSave={save} onDone={()=>{setSummary(null);coach.clear();setPage('history')}} error={saveError||coach.error}/>}
    {page==='history'&&!running&&!summary&&<TrainingHistory sessions={history} onSelect={openHistory} weeklyTarget={weeklyTarget}/>}
    <section className="training-page" hidden={page!=='train'||!!summary} aria-label="训练">
      {!running&&<>
        <WeekStrip history={history}/>
        {pending&&<div className="notice"><p>上次还有 {pending.sessions.length} 组总结待保存。</p><button onClick={()=>{setSummary(pending);setSummarySaved(false)}}>继续上次总结</button></div>}
        <section className="recommendation" aria-label="今日建议"><p>今日建议</p><div className="suggestion-pose"><ExerciseIcon exercise={exercise}/></div><h3>{EXERCISE_NAMES[exercise]}</h3><div className="plan-amount">{plan.sets} × {plan.target} {timed?'秒':'次'}</div><p>上次标准率 {previousQuality===null?'未评估':previousQuality+'%'}<br/>今日目标 {timed?`每组保持 ${plan.target} 秒`:previousQuality===null?'先完成可控动作':`标准率 ${Math.min(95,previousQuality+5)}%`}</p><div className="camera-tags"><span>{angleLabel(exercise)}</span><span>距离约 2 米</span><span>手机与腰同高</span></div><p className="rest-note">组间休息 {plan.restSeconds} 秒</p><div className="recommendation-bottom"><button className="recommendation-start" onClick={()=>begin()} disabled={coach.loading}>{coach.loading?'准备中':'开始训练'}</button></div>
          <details className="plan-editor"><summary>调整计划</summary><div><label>组数<input disabled={coach.loading} type="number" min="1" max="10" value={plan.sets} onChange={e=>mutatePlan({sets:Math.max(1,Math.min(10,Number(e.target.value)||1))})}/></label><label>{timed?'每组秒数':'每组次数'}<input disabled={coach.loading} type="number" min={timed?10:1} max={timed?120:100} value={plan.target} onChange={e=>mutatePlan({target:Math.max(timed?10:1,Math.min(timed?120:100,Number(e.target.value)||1))})}/></label><label>休息秒数<input disabled={coach.loading} type="number" min="10" max="180" value={plan.restSeconds} onChange={e=>mutatePlan({restSeconds:Math.max(10,Math.min(180,Number(e.target.value)||10))})}/></label></div></details>
        </section>
        <RecentExercises history={history} disabled={coach.loading} onSelect={kind=>{choose(kind);window.scrollTo({top:0,behavior:'smooth'})}}/><div className="exercise-groups"><h2>全部动作</h2>{GROUPS.map(group=><section key={group.name}><h3>{group.name}</h3>{group.exercises.map(kind=><button key={kind} className="exercise-row" aria-pressed={kind===exercise} disabled={coach.loading} onClick={()=>choose(kind)}><ExerciseIcon exercise={kind}/><strong>{EXERCISE_NAMES[kind]}</strong><span>{isTimedExercise(kind)?'计时':'计次'} · {kind==='russian_twist'?'正拍':'侧拍'}{kind==='dumbbell_curl'?' · 左右分别计':''}</span></button>)}</section>)}</div>
        {exercise==='dumbbell_curl'&&<p className="history-note">每只手各计一次，双手一轮共两次。侧面略偏正，尽量让双臂都入镜；只看清一侧时只计该手。</p>}
        {exercise==='russian_twist'&&<p className="history-note">左一下计一次，右一下计一次，不合并为一对。</p>}
        {exercise==='wall_sit'&&<button className="timer-only-start" disabled={coach.loading} onClick={()=>begin(true)}>仅计时（无需摄像头）</button>}
        {coach.error&&<p className="error" role="alert">{coach.error}</p>}
      </>}
      <div className="camera-card" hidden={!running}>
        <div className="camera-stage">
          {view&&running&&<div className="camera-overlay-top"><div className="live-status"><span className={`dot ${view.feedback.bodyVisible?'status-tracking':'status-lost'}`}/>{view.stage==='active'?'正在训练':view.stage==='paused'?'已暂停':view.stage==='rest'?'组间休息':'准备动作'}<span className="live-elapsed">用时 {duration(view.elapsed)}</span></div>
            <div className="training-hud"><div className="count-ring" style={{background:`conic-gradient(#101411 ${Math.min(1,(timed?(view.snapshot.hold?.heldMs??0)/1000:view.snapshot.repCount)/plan.target)*360}deg,#e4f8ad 0)`}}><div className="hud-reps"><strong>{timed?Math.floor((view.snapshot.hold?.heldMs??0)/1000):view.snapshot.repCount}</strong><span>{timed?'保持秒数':exercise==='squat'?'有效':'完成'} · 目标 {plan.target}{timed?' 秒':''}</span></div></div>{exercise==='dumbbell_curl'&&<p className="arm-caption">左手 {view.snapshot.armCounts?.left??0} · 右手 {view.snapshot.armCounts?.right??0}</p>}</div>
            {!timed&&<><QualityStrip records={records} target={plan.target} exercise={exercise}/><p className="attempt-reason">尝试 {view.snapshot.attemptCount} · {view.lastMiss}</p></>}
          </div>}
          <div className="camera-viewport" style={{'--camera-shade':coach.luminance!==null&&coach.luminance<60?'.45':'.12'} as React.CSSProperties}><video ref={coach.videoRef} className="camera-feed" playsInline muted/><canvas ref={coach.canvasRef} className="skeleton-canvas" aria-label="人体骨架叠加层"/>
            {running&&view?.feedback.severity==='caution'&&coach.anchor&&<div className="joint-callout" style={{left:Math.max(5,Math.min(60,coach.anchor.x))+'%',top:Math.max(5,Math.min(75,coach.anchor.y+8))+'%'}}>{view.feedback.key==='shallow'?'深度不足':view.feedback.key==='knees-in'?'膝盖对准脚尖':view.feedback.key==='lean'?'稳住躯干，减少前倾':'调整提示部位'}</div>}
            {running&&coach.timerOnly&&<div className="timer-only-message"><ExerciseIcon exercise="wall_sit"/><p>背贴墙，脚踩稳，自然呼吸</p><small>纯计时 · 请自己确认姿势</small></div>}
            {view&&running&&(view.stage==='countdown'||view.stage==='ready'||view.stage==='rest'||view.stage==='paused')&&<div className={`flow-overlay stage-${view.stage}`}><strong>{view.stage==='countdown'?view.countdown:view.stage==='rest'?view.remainingRest:view.stage==='paused'?'已暂停':'准备好了吗'}</strong><p>{view.stage==='rest'?`第 ${view.completed} 组已完成，放松呼吸`:view.stage==='ready'?exercise==='squat'?'站姿稳定后，3–2–1 自动开始':'起始姿势稳定后，3–2–1 自动开始':view.stage==='paused'?'调整好姿势，再继续':'保持姿势'}</p>{view.stage==='ready'&&<button className="secondary" onClick={coach.manualStart}>已准备好，手动倒数</button>}{view.stage==='rest'&&<button className="secondary" onClick={coach.skipRest}>休息好了，准备下一组</button>}</div>}
            {view&&running&&exercise==='squat'&&view.feedback.depth!==null&&<div className="depth-meter" aria-label={`深度进度 ${Math.round(view.feedback.depth*100)}%`}><span>深度</span><div><i/><b style={{top:`${view.feedback.depth*100}%`}}/></div><small>目标</small></div>}
          </div>
          {view&&running&&<div className={`camera-overlay-bottom cue-${view.feedback.severity}`}><div className="coach-cue"><div><small>教练提示{view.feedback.severity==='stop'?' · 暂停检查':''}</small><strong>{view.feedback.text}</strong></div></div></div>}
        </div>
        {view&&running&&<div className="training-metrics"><div><strong>{timed||liveQuality===null?'—':liveQuality+'%'}</strong><span>实时可见标准率</span></div><div><strong>{duration(view.elapsed)}</strong><span>用时</span></div><div><strong>{view.feedback.depth===null?'—':view.feedback.depth>=.72?'已到目标':'未到目标'}</strong><span>{timed?'保持不评分':'目标深度'}</span></div></div>}
        {view&&running&&<div className="training-actions"><button className="pause-action" onClick={view.stage==='paused'?coach.resume:coach.pause} disabled={view.stage==='rest'}>{view.stage==='paused'?'继续':'暂停'}</button><HoldToFinish onFinish={coach.finish}/></div>}
        {running&&<div className="voice-inline"><span role="status">{coach.voiceStatus}</span><button onClick={coach.testVoice}>试听</button></div>}
        {running&&coach.error&&<p className="error" role="alert">{coach.error}</p>}
      </div>
    </section>
    {!running&&!summary&&<><p className="privacy-footer">画面仅在本机识别，不会上传</p><nav className="bottom-nav" aria-label="主导航">{(['train','history','settings'] as const).map(item=><button key={item} disabled={coach.loading} aria-current={page===item?'page':undefined} onClick={()=>{setPage(item);window.scrollTo(0,0)}}><Icon name={item}/><span>{item==='train'?'训练':item==='history'?'记录':'设置'}</span></button>)}</nav></>}
  </main>
}

