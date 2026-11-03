import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const browser=await chromium.launch({executablePath:process.env.UI_TEST_BROWSER,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],resources=[]
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.ok()&&/\.wasm|\.task/.test(r.url()))resources.push(r.url())})
const base=process.env.UI_TEST_BASE||'http://127.0.0.1:5173/ai-motion-coach/'
try{
 await page.goto(base);await page.getByRole('button',{name:'开始训练',exact:true}).click()
 await page.getByRole('button',{name:'已准备好，手动倒数'}).waitFor({timeout:60000})
 assert.ok(resources.some(s=>s.includes('.wasm'))&&resources.some(s=>s.includes('.task')),'real model and WASM loaded')
 assert.ok(await page.locator('video').evaluate(v=>v.videoWidth>0&&!v.paused))
 await page.getByRole('button',{name:'已准备好，手动倒数'}).click()
 await page.locator('.live-status').filter({hasText:'正在训练'}).waitFor({timeout:7000})
 const finish=page.getByRole('button',{name:'长按一秒结束训练'}),box=await finish.boundingBox()
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up()
 assert.equal(await page.getByRole('region',{name:'训练总结'}).count(),0)
 await page.mouse.down();await page.waitForTimeout(1150);await page.mouse.up()
 await page.getByRole('region',{name:'训练总结'}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('motion-coach.sessions.v1')||'[]').length),0)
 await page.getByRole('button',{name:'保存并完成',exact:true}).click()
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length),1)
 console.log('PASS actual getUserMedia + MediaPipe/WASM, short press cancelled, one-second finish, summary before save')
 await page.getByRole('navigation').getByRole('button',{name:'训练',exact:true}).click()
 await page.locator('.exercise-row').filter({hasText:'靠墙静蹲'}).click()
 await page.getByRole('button',{name:'仅计时（无需摄像头）'}).click()
 await page.locator('.live-status').filter({hasText:'正在训练'}).waitFor({timeout:6000})
 assert.equal(await page.locator('.training-metrics').count(),0);await page.screenshot({path:resolve('outputs/ui-v2-review/embedded-hold.png')});await page.waitForTimeout(1200);assert.equal(await page.locator('.attempt-reason').count(),0)
 await page.getByRole('button',{name:'暂停',exact:true}).click()
 const held=await page.locator('.hud-reps strong').innerText();await page.waitForTimeout(700);assert.equal(await page.locator('.hud-reps strong').innerText(),held)
 await page.getByRole('button',{name:'长按一秒结束训练'}).focus();await page.keyboard.down('Space');await page.waitForTimeout(1150);await page.keyboard.up('Space')
 await page.getByRole('region',{name:'训练总结'}).waitFor()
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('motion-coach.workout-draft.v2')))
 assert.equal(draft.sessions[0].hold.timerMode,'manual');assert.ok(draft.sessions[0].hold.heldMs>=1000&&draft.sessions[0].hold.heldMs<2500)
 assert.equal(draft.sessions[0].wallSit.currentMs,0)
 await page.screenshot({path:resolve('outputs/ui-v2-review/timed-summary.png'),fullPage:true})
 assert.deepEqual(errors,[])
 console.log('PASS wall timer-only mode, static seconds not reps, paused time frozen, keyboard hold and original manual metadata')
}finally{await browser.close()}
