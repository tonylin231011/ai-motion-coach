// Isolated browser profile and synthetic records only. Never reads real browser data.
// PLAYWRIGHT_MODULE may point to a bundled playwright package's index.mjs.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const out = resolve('outputs/ui-review'); await mkdir(out, { recursive: true })
const base = process.env.UI_TEST_BASE || 'http://127.0.0.1:5173/ai-motion-coach/'
const browser = await chromium.launch({ executablePath: process.env.UI_TEST_BROWSER, headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []; page.on('pageerror', error => errors.push(error.message))
const now = Date.now()
const exercises = ['squat', 'pushup', 'plank', 'russian_twist', 'reverse_crunch', 'dumbbell_curl', 'wall_sit']
const sessions = Array.from({ length: 128 }, (_, i) => {
  const exercise = exercises[i % exercises.length]
  return { id: `ui-fixture-${i}`, exercise, endedAt: now - i * 3600000 * 8, durationMs: 90000, repCount: 24, attemptCount: 25, records: [],
    ...(exercise === 'pushup' ? { countMode: 'completed' } : {}),
    ...(exercise === 'russian_twist' ? { twistCountUnit: 'sides' } : {}),
    ...(exercise === 'dumbbell_curl' ? { curlCountUnit: 'arm_reps', armCounts: { left: 12, right: 12 }, attemptCount: 24 } : {}),
    ...(exercise === 'plank' ? { repCount: 0, attemptCount: 0, hold: { heldMs: 70000, bestMs: 70000, breaks: 0, timerMode: 'assisted' } } : {}),
    ...(exercise === 'wall_sit' ? { repCount: 1, attemptCount: 1, hold: { heldMs: 30000, bestMs: 30000, breaks: 0, timerMode: 'manual' }, wallSit: { targetMs: 20000, currentMs: 0, completedSets: 1, sets: [{ heldMs: 30000, completed: true }] } } : {}),
  }
})
await context.addInitScript(records => {
  if (!localStorage.getItem('motion-coach.sessions.v1')) localStorage.setItem('motion-coach.sessions.v1', JSON.stringify(records))
}, sessions)
const passes = []
const pass = label => { passes.push(label); console.log(`PASS ${label}`) }
const nav = name => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true })
async function noOverflow(label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label)
}
try {
  await page.goto(base)
  await page.getByRole('heading', { name: '今天，练什么？' }).waitFor()
  assert.equal(await page.locator('.exercise-options button').count(), 7)
  await noOverflow('phone home')
  const firstRecords = await page.evaluate(() => localStorage.getItem('motion-coach.sessions.v1'))
  for (const [width, height] of [[390, 844], [360, 640], [320, 568], [844, 390], [1280, 900]]) {
    await page.setViewportSize({ width, height })
    await noOverflow(`${width}x${height}`)
    await page.getByRole('button', { name: '开启摄像头', exact: true }).scrollIntoViewIfNeeded()
    assert.ok(await page.locator('.primary-action').evaluate(el => {
      const r = el.getBoundingClientRect(); const nav = document.querySelector('.bottom-nav').getBoundingClientRect()
      return r.bottom <= nav.top && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el
    }), 'start button must not be covered by bottom navigation')
    await page.screenshot({ path: resolve(out, `home-${width}.png`), fullPage: true })
  }
  pass('home: seven exercises, no horizontal overflow at five viewport sizes')
  await page.setViewportSize({ width: 390, height: 844 })
  await nav('记录').click()
  assert.equal(await page.locator('.history-entry').count(), 128)
  await page.screenshot({ path: resolve(out, 'history.png') })
  await page.locator('.heat-cell:not(:disabled)').last().click()
  assert.ok(await page.locator('.day-detail').isVisible(), 'heatmap day details remain accessible')
  await page.getByRole('button', { name: '哑铃弯举', exact: true }).click()
  assert.match(await page.locator('.history-entry').first().innerText(), /左 12 · 右 12/)
  await page.locator('.history-entry').first().click()
  await page.getByRole('dialog').waitFor()
  assert.match(await page.getByRole('dialog').innerText(), /每只手各计一次/)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '平板支撑', exact: true }).click()
  assert.match(await page.locator('.history-entry').first().innerText(), /保持 1分10秒/)
  await page.getByRole('button', { name: '俄罗斯转体', exact: true }).click()
  assert.match(await page.locator('.history-entry').first().innerText(), /每侧计一次/)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出全部训练记录' }).click()
  await (await download).saveAs(resolve(out, 'synthetic-export.json'))
  pass('history: 128 records, filtering, original units, details and full export')
  await nav('设置').click()
  await page.getByRole('button', { name: '试听', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.src.endsWith('/voice/test.mp3'))
  await page.getByText('云端备份', { exact: false }).first().click()
  await page.getByRole('button', { name: '连接并同步历史', exact: true }).click()
  await page.getByText(/密钥不完整/).first().waitFor()
  await page.getByRole('checkbox', { name: /显示动作技术详情/ }).check()
  await page.screenshot({ path: resolve(out, 'settings.png'), fullPage: true })
  assert.equal(await page.evaluate(() => localStorage.getItem('motion-coach.sessions.v1')), firstRecords)
  pass('settings: voice source, visible sync validation, debug toggle, history unchanged')
  await nav('训练').click()
  // Real browser camera API + local MediaPipe model, using Chromium's fake camera.
  await page.getByRole('button', { name: '哑铃弯举', exact: true }).click()
  await page.getByRole('button', { name: '开启摄像头', exact: true }).click()
  await page.getByRole('button', { name: '结束并保存' }).waitFor({ timeout: 60000 })
  assert.match(await page.locator('.training-hud').innerText(), /左手[\s\S]*右手/)
  assert.equal(await page.getByRole('navigation').count(), 0)
  for (const [width, height] of [[390, 844], [360, 640], [844, 390]]) {
    await page.setViewportSize({ width, height }); await noOverflow('training')
    const metrics = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
      return { video: rect('.camera-viewport'), hud: rect('.camera-overlay-top'), cue: rect('.camera-overlay-bottom'), finish: rect('.primary-action'), height: innerHeight }
    })
    assert.ok(metrics.finish.bottom <= metrics.height + 1, `finish visible ${width}`)
    assert.ok(metrics.video.width > 100 && metrics.video.height >= 80, 'usable camera viewport')
    if (height > width) assert.ok(metrics.hud.bottom <= metrics.video.top + 1 && metrics.video.bottom <= metrics.cue.top + 1, 'controls do not obscure image')
    await page.screenshot({ path: resolve(out, `training-${width}.png`), fullPage: true })
  }
  await page.getByRole('button', { name: '结束并保存' }).click()
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length), 129)
  pass('camera/model: actual browser pipeline starts, left/right HUD, portrait/landscape fit, save')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '靠墙静蹲', exact: true }).click()
  await page.getByRole('button', { name: '仅计时（无需摄像头）' }).click()
  await page.getByRole('button', { name: '开始本组', exact: true }).click()
  await page.waitForTimeout(1250)
  assert.match(await page.locator('.hud-reps strong').innerText(), /[1-9]/)
  await page.getByRole('button', { name: '暂停本组', exact: true }).click()
  await page.getByRole('button', { name: '结束并保存' }).click()
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length), 130)
  pass('wall sit: timer-only start, tick, pause, save retains previous records')
  // No real service/credentials: verify the same mounted sync worker remains active
  // while its configuration UI is hidden on other pages.
  const syncContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const endpoint = 'https://ui-sync.example.test/training-sync'
  const stored = new Map(); let offline = false
  await syncContext.route('https://ui-sync.example.test/**', async route => {
    if (offline) return route.abort('internetdisconnected')
    const request = route.request()
    if (request.method() === 'POST') {
      const session = request.postDataJSON().session; stored.set(session.id, session)
      return route.fulfill({ json: { savedId: session.id } })
    }
    return route.fulfill({ json: { sessions: [...stored.values()], nextCursor: null } })
  })
  await syncContext.addInitScript(({ records, endpoint }) => {
    localStorage.setItem('motion-coach.sessions.v1', JSON.stringify(records))
    localStorage.setItem('motion-coach.sync.v1', JSON.stringify({ endpoint, token: 'synthetic-ui-only-token'.repeat(3) }))
  }, { records: sessions.slice(0, 2), endpoint })
  const syncPage = await syncContext.newPage(); await syncPage.goto(base)
  await syncPage.locator('.sync-badge').filter({ hasText: '云端已同步' }).waitFor()
  assert.equal(stored.size, 2)
  await syncPage.getByRole('navigation').getByRole('button', { name: '记录', exact: true }).click()
  assert.equal(await syncPage.locator('.history-entry').count(), 2)
  await syncPage.getByRole('navigation').getByRole('button', { name: '训练', exact: true }).click()
  offline = true
  await syncPage.getByRole('button', { name: '靠墙静蹲', exact: true }).click()
  await syncPage.getByRole('button', { name: '仅计时（无需摄像头）' }).click()
  await syncPage.getByRole('button', { name: '开始本组', exact: true }).click()
  await syncPage.waitForTimeout(500)
  await syncPage.getByRole('button', { name: '结束并保存' }).click()
  await syncPage.getByRole('button', { name: '关闭', exact: true }).click()
  await syncPage.locator('.sync-badge').filter({ hasText: '同步待处理' }).waitFor()
  assert.equal(await syncPage.evaluate(() => JSON.parse(localStorage.getItem('motion-coach.sessions.v1')).length), 3)
  offline = false; await syncPage.evaluate(() => window.dispatchEvent(new Event('online')))
  await syncPage.locator('.sync-badge').filter({ hasText: '云端已同步' }).waitFor()
  assert.equal(stored.size, 3)
  await syncContext.close()
  pass('hidden sync worker: initial migration, navigation, save, offline retention and online retry')
  assert.deepEqual(errors, [])
  await writeFile(resolve(out, 'result.json'), JSON.stringify({ base, passes, errors }, null, 2))
} finally { await browser.close() }
