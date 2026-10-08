async page => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:5174') throw new Error('Run only against the isolated local preview')
  const check = (ok, message) => { if (!ok) throw new Error(message) }
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', {name:'靠墙静蹲',exact:true}).click()
  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('motion-coach.sessions.v1') || '[]'))
  const latest = sessions.find(s => s.exercise === 'wall_sit')
  check(latest?.repCount === 1 && latest?.attemptCount === 3, 'reloaded training result differs')
  check(await dialog.getByLabel('静蹲进步跟踪').count() === 1, 'progress missing after refresh')
  check((await dialog.locator('.history-entry').first().textContent()).includes('达标 1/3 组'), 'reloaded history summary differs')
  const layouts = []
  for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[667,375]]) {
    await page.setViewportSize({width,height})
    const overflow = await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)
    check(overflow <= 1, `history dialog overflows at ${width}`)
    await dialog.getByRole('button', {name:'导出全部训练记录',exact:true}).scrollIntoViewIfNeeded()
    const box = await dialog.getByRole('button', {name:'导出全部训练记录',exact:true}).boundingBox()
    check(box.y >= 0 && box.y+box.height <= height, `export inaccessible at ${width}`)
    layouts.push({width,height,overflow})
  }
  const downloadEvent = page.waitForEvent('download')
  await dialog.getByRole('button', {name:'导出全部训练记录',exact:true}).click()
  const download = await downloadEvent
  await download.saveAs('output/playwright/wall-history-test.json')
  check(await download.failure() === null, 'download failed')
  const clips = await page.evaluate(async () => {
    const context = new AudioContext()
    try {
      const results = []
      for (const cue of ['start','ready','pause','goal','breathe','unclear','finished']) {
        const response = await fetch(`/ai-motion-coach/voice/v18-wall-${cue}.mp3`)
        if (!response.ok) throw new Error(`Missing voice ${cue}: ${response.status}`)
        const bytes = await response.arrayBuffer()
        const audio = await context.decodeAudioData(bytes)
        if (audio.duration <= 0) throw new Error(`Empty voice ${cue}`)
        results.push({cue,seconds:audio.duration})
      }
      return results
    } finally { await context.close() }
  })
  await page.setViewportSize({width:375,height:667})
  await page.screenshot({path:'output/playwright/wall-history.png',scale:'css'})
  return {refresh:'PASS',download:'PASS',existingSquatRetained:sessions.some(s=>s.id==='wall-local-legacy-squat'),sessions,layouts,clips}
}
