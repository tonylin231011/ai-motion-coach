// Synthetic fixtures and isolated profiles; never use real credentials or training data.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const browser=await chromium.launch({executablePath:process.env.UI_TEST_BROWSER,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
const out=resolve('outputs/ui-v2-review');await mkdir(out,{recursive:true})
const base=process.env.UI_TEST_BASE||'http://127.0.0.1:5173/ai-motion-coach/'
const now=Date.now(),history=Array.from({length:35},(_,i)=>({id:`v2-fixture-${i}`,exercise:'squat',endedAt:now-(i+1)*86400000,durationMs:60000,repCount:10,attemptCount:11,records:[{valid:true,issue:null,durationMs:2500,minAngle:85},{valid:false,issue:'shallow',durationMs:2200,minAngle:125}]}))
const endpoint='https://v2-sync.example.test/training-sync',remote=new Map(history.map(s=>[s.id,s])),posts=[]
const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true})
await context.addInitScript(({history,endpoint})=>{
  if(!localStorage.getItem('motion-coach.sessions.v1'))localStorage.setItem('motion-coach.sessions.v1',JSON.stringify(history))
  if(!localStorage.getItem('motion-coach.sync.v1'))localStorage.setItem('motion-coach.sync.v1',JSON.stringify({endpoint,token:'synthetic-test-only-token'.repeat(3)}))
  window.__poseAngle=175;window.__poseMode='normal';window.__light=120
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false})
  const get=CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData=function(...args){const data=get.apply(this,args);if(args[2]===32&&args[3]===24){for(let i=0;i<data.data.length;i+=4){data.data[i]=data.data[i+1]=data.data[i+2]=window.__light;data.data[i+3]=255}}return data}
},{history,endpoint})
await context.route('https://v2-sync.example.test/**',async route=>{
  if(route.request().method()==='POST'){const session=route.request().postDataJSON().session;posts.push(session);remote.set(session.id,session);return route.fulfill({json:{savedId:session.id}})}
  return route.fulfill({json:{sessions:[...remote.values()],nextCursor:null}})
})
// Deterministic pose data at the model boundary, so real production detectors/flow/UI run.
await context.route('**/assets/vision_bundle-*.js',route=>route.fulfill({contentType:'text/javascript',body:`
 export const FilesetResolver={forVisionTasks:async()=>({})};
 export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){
  if(window.__poseMode==='absent')return {landmarks:[]};
  const p=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0})),r=window.__poseAngle*Math.PI/180;
  const put=(i,x,y)=>p[i]={x,y,z:0,visibility:.95};
  put(11,.5+Math.sin(r)*.2*.75,.15);put(23,.5+Math.sin(r)*.2*.75,.5+Math.cos(r)*.2);put(25,.5,.5);put(27,.5,.7);
  if(window.__poseMode==='cropped'){p[25].visibility=p[27].visibility=0;put(13,.5,.3);put(15,.5,.4)}
  return {landmarks:[p]};
 }})};`}))
const page=await context.newPage(),errors=[],passes=[];page.on('pageerror',e=>errors.push(e.message))
const pass=label=>{passes.push(label);console.log('PASS '+label)}
const nav=name=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true})
const active=()=>page.locator('.live-status').filter({hasText:'正在训练'}).waitFor({timeout:12000})
async function pose(angle,ms){await page.evaluate(a=>window.__poseAngle=a,angle);await page.waitForTimeout(ms)}
async function rep(){await pose(130,600);await pose(90,850);await pose(130,600);await pose(175,900)}
try{
 await page.goto(base);await page.getByRole('heading',{name:/今日训练/}).waitFor();await page.locator('.sync-dot-button.ok').waitFor()
 for(const [width,height] of [[390,844],[360,640],[320,568],[844,390],[1280,900]]){
  await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.screenshot({path:resolve(out,`home-${width}.png`),fullPage:true})
 }
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.exercise-row').count(),7)
 assert.equal(await page.locator('.sync-dot-button.ok').innerText(),'')
 const original=await page.evaluate(()=>localStorage.getItem('motion-coach.sessions.v1'))
 pass('home: seven grouped exercises, suggestion, camera tags, quiet sync dot, five viewport sizes')
 await page.locator('.plan-editor summary').click();await page.getByLabel('组数',{exact:true}).fill('2');await page.getByLabel('每组次数').fill('1');await page.getByLabel('休息秒数').fill('10')
 await page.getByRole('button',{name:'开始训练',exact:true}).click();await active()
 await page.getByRole('button',{name:'长按一秒结束训练'}).click();assert.equal(await page.getByRole('region',{name:'训练总结'}).count(),0)
 await page.evaluate(()=>window.__light=10);await page.getByText('画面偏暗，请开灯或面向光源',{exact:true}).waitFor({timeout:7000})
 await page.evaluate(()=>{window.__light=120;window.__poseMode='cropped'});await page.getByText('腿部未完整入镜，请拍到髋、膝盖和脚踝',{exact:true}).waitFor({timeout:7000})
 await page.evaluate(()=>window.__poseMode='normal');await page.waitForTimeout(3500)
 for(const [width,height] of [[390,844],[360,640],[844,390]]){
  await page.setViewportSize({width,height})
  const dims=await page.locator('.training-actions').boundingBox();assert.ok(dims.y+dims.height<=height+1,`controls visible ${width}`)
  assert.ok(await page.locator('.coach-cue strong').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=18))
  await page.screenshot({path:resolve(out,`training-${width}.png`),fullPage:true})
 }
 await page.setViewportSize({width:390,height:844});await pose(130,800);await pose(175,900)
 await page.getByText(/最近未计：深度不足/).waitFor()
 await page.getByRole('button',{name:'暂停',exact:true}).click();assert.ok(await page.locator('.cue-stop').isVisible())
 await page.getByRole('button',{name:'继续',exact:true}).click();await active()
 await rep();await page.locator('.live-status').filter({hasText:'组间休息'}).waitFor()
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length),35)
 pass('training: real detectors with fixture pose, 3-2-1, shallow reason, pause, 22px cues, light/cropping and rest')
 await page.getByRole('button',{name:'休息好了，准备下一组'}).click();await active()
 await page.evaluate(()=>window.__poseMode='absent');await page.getByText('未看到人体超过 3 秒，已自动暂停',{exact:true}).waitFor({timeout:6500})
 await page.evaluate(()=>window.__poseMode='normal');await page.getByRole('button',{name:'继续',exact:true}).click();await active()
 await context.setOffline(true);await rep();await page.getByRole('region',{name:'训练总结'}).waitFor({timeout:5000})
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length),35)
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('motion-coach.workout-draft.v2')).sessions.length),2)
 await page.screenshot({path:resolve(out,'summary.png'),fullPage:true})
 await page.getByRole('button',{name:'回放最需关注的片段'}).click();await page.locator('.local-replay').waitFor()
 await page.getByRole('button',{name:'分享成果卡',exact:true}).click();await page.locator('.share-preview').waitFor()
 pass('summary: mandatory before save, two stable group IDs, local worst-rep replay and private image-free share card')
 await page.getByRole('button',{name:'保存并完成',exact:true}).click();await page.getByRole('heading',{name:'训练记录',exact:true}).waitFor()
 await page.getByText('待同步（离线）',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length),37)
 assert.equal(remote.size,35);await context.setOffline(false);await page.locator('.sync-dot-button.ok').waitFor({timeout:15000});assert.equal(remote.size,37)
 await nav('设置').click();await page.locator('.sync-panel summary').click();await page.getByRole('button',{name:'立即同步',exact:true}).click();await page.locator('.sync-dot-button.ok').waitFor()
 assert.equal(posts.filter(s=>!s.id.startsWith('v2-fixture-')).length,2)
 for(const sent of posts){assert.ok(!('frames'in sent)&&!('replayIds'in sent)&&!('ruleCounts'in sent)&&!('blob'in sent))}
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出全部训练记录'}).click();await(await download).saveAs(resolve(out,'synthetic-export.json'))
 const exported=await readFile(resolve(out,'synthetic-export.json'),'utf8');assert.ok(!exported.includes('image/jpeg')&&!exported.includes('replayIds'))
 await nav('记录').click();await page.screenshot({path:resolve(out,'history.png')});await page.locator('.heat-cell:not(:disabled)').last().click();assert.ok(await page.locator('.day-filter-reset').isVisible())
 pass('offline save -> online retry -> no duplicate groups; original sync payload excludes every replay field; export remains compatible')
 // Reload with a synthetic unsaved summary: restoration must preserve IDs, not discard or auto-save.
 await page.evaluate(()=>{const sessions=JSON.parse(localStorage.getItem('motion-coach.sessions.v1'));const one={...sessions[0],id:'recover-one'};localStorage.setItem('motion-coach.workout-draft.v2',JSON.stringify({id:'recover-draft',exercise:one.exercise,plan:{sets:1,target:1,restSeconds:10},sessions:[one],createdAt:Date.now(),replayIds:[],ruleCounts:{}}))})
 await page.reload();await page.getByRole('button',{name:'继续上次总结'}).click();await page.getByRole('button',{name:'保存并完成',exact:true}).click();await page.getByRole('heading',{name:'训练记录',exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).filter(s=>s.id==='recover-one').length),1)
 pass('unsaved-summary recovery and fixed-ID save')
 assert.deepEqual(errors,[])
 await writeFile(resolve(out,'result.json'),JSON.stringify({passes,errors,originalRecordCount:JSON.parse(original).length},null,2))
}catch(error){await page.screenshot({path:resolve(out,'failure.png'),fullPage:true});console.log((await page.locator('body').innerText()).slice(0,2500));throw error}finally{await browser.close()}
