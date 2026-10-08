async page => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:5174') throw new Error('Run only against the isolated local preview')
  const check = (ok, message) => { if (!ok) throw new Error(message) }
  const key = 'motion-coach.sessions.v1'
  if (await page.getByRole('button', {name:'结束训练',exact:true}).count()) {
    await page.getByRole('button', {name:'结束训练',exact:true}).click()
  }
  if (await page.getByRole('button', {name:'关闭',exact:true}).isVisible()) await page.getByRole('button', {name:'关闭',exact:true}).click()
  await page.evaluate(key => {
    const rows = JSON.parse(localStorage.getItem(key) || '[]')
    if (!rows.some(s => s.id === 'wall-local-legacy-squat')) {
      rows.push({id:'wall-local-legacy-squat',exercise:'squat',endedAt:Date.now()-86400000,durationMs:8000,repCount:1,attemptCount:1,records:[]})
      localStorage.setItem(key,JSON.stringify(rows))
    }
  }, key)
  await page.reload()
  await page.getByRole('button', {name:'靠墙静蹲',exact:true}).click()
  await page.getByLabel('静蹲每组目标时长').selectOption('10')
  await page.getByRole('button', {name:'仅计时（无需摄像头）',exact:true}).click()
  const before = await page.evaluate(key => localStorage.getItem(key), key)
  const initial = JSON.parse(before || '[]')
  const hold = () => page.locator('.hud-reps strong').textContent()
  await page.getByRole('button', { name: '开始本组', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: '暂停本组', exact: true }).click()
  const paused = await hold()
  check(parseInt(paused) >= 1, 'start did not accumulate time')
  await page.waitForTimeout(1300)
  check(await hold() === paused, 'pause included rest time')
  await page.getByRole('button', { name: '开始下一组', exact: true }).click()
  check((await page.getByLabel('本组静蹲进度').textContent()).includes('本组 0 / 10 秒'), 'next set did not reset')
  await page.waitForTimeout(10700)
  check((await page.locator('.hud-reps').textContent()).includes('达标 1 / 尝试 2 组'), 'target set was not counted')
  check((await page.locator('.coach-cue strong').textContent()).includes('本组已达标'), 'goal feedback stale')
  await page.waitForTimeout(1100)
  check((await page.locator('.hud-reps').textContent()).includes('达标 1 / 尝试 2 组'), 'continuous hold counted twice')
  await page.getByRole('button', { name: '暂停本组', exact: true }).click()
  await page.waitForTimeout(300)
  check((await page.locator('.coach-cue strong').textContent()).includes('已暂停'), 'pause feedback stale')
  const layouts = []
  for (const [width, height] of [[320,568],[375,667],[390,844],[430,932],[667,375]]) {
    await page.setViewportSize({ width, height })
    const result = await page.evaluate(() => {
      const selectors = ['.live-status','.training-hud','.timer-only-message','.wall-live-controls','.coach-cue']
      const boxes = selectors.map(selector => ({selector,rect:document.querySelector(selector).getBoundingClientRect().toJSON()}))
      const overlaps = boxes.flatMap((a,i) => boxes.slice(i+1).filter(b => a.rect.left < b.rect.right && a.rect.right > b.rect.left && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top).map(b => [a.selector,b.selector]))
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overlaps}
    })
    check(result.scrollWidth <= width, `horizontal overflow at ${width}`)
    check(result.overlaps.length === 0, `overlapping controls at ${width}: ${JSON.stringify(result.overlaps)}`)
    const finish = page.getByRole('button', { name: '结束训练', exact: true })
    await finish.scrollIntoViewIfNeeded()
    const box = await finish.boundingBox()
    check(box.y >= 0 && box.y + box.height <= height, `finish inaccessible at ${width}`)
    await page.screenshot({path:`output/playwright/wall-${width}x${height}-paused.png`,fullPage:true})
    layouts.push(result)
  }
  await page.getByRole('button', { name: '开始下一组', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '结束训练', exact: true }).click()
  await page.getByRole('heading', { name: '本次训练完成', exact: true }).waitFor()
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), key)
  const session = saved[0]
  check(saved.length === initial.length + 1, 'save changed history count unexpectedly')
  check(initial.every(old => saved.some(row => JSON.stringify(old) === JSON.stringify(row))), 'existing records changed')
  check(session.exercise === 'wall_sit' && session.repCount === 1 && session.attemptCount === 3, 'wrong set totals')
  check(session.wallSit.sets.length === 3 && session.wallSit.currentMs === 0, 'unfinished set not closed')
  check(session.wallSit.sets.map(s=>s.completed).join() === 'false,true,false', 'partial sets combined or lost')
  check(Math.abs(session.hold.heldMs - session.wallSit.sets.reduce((n,s)=>n+s.heldMs,0)) < .01, 'hold total differs from sets')
  await page.setViewportSize({width:375,height:667})
  await page.screenshot({path:'output/playwright/wall-summary.png',fullPage:true})
  return {flow:'PASS',layouts,session}
}
