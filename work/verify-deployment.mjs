import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const base = 'https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com/ai-motion-coach/'
const dist = resolve('dist')
const stamp = Date.now()
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function remote(path) {
  const response = await fetch(new URL(`${path}?verify=${stamp}`, base), {
    cache: 'no-store', signal: AbortSignal.timeout(60000),
  })
  assert.ok(response.ok, `${path}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}
async function verify(path) {
  const [local, live] = await Promise.all([readFile(resolve(dist, path)), remote(path)])
  assert.equal(hash(live), hash(local), `Published bytes differ: ${path}`)
  console.log(`PASS ${path} (${live.length} bytes)`)
  return live
}
const html = (await verify('index.html')).toString()
assert.equal(hash(await remote('')), hash(Buffer.from(html)), 'Directory entry differs from index.html')
console.log('PASS directory entry matches index.html')
const assets = [...html.matchAll(/(?:src|href)="\/ai-motion-coach\/(assets\/[^"\s]+)"/g)].map(match => match[1])
assert.ok(assets.some(path => path.endsWith('.js')), 'No application script found')
const builtAssets = (await readdir(resolve(dist, 'assets'))).filter(name => /\.(js|css)$/.test(name)).map(name => `assets/${name}`)
const bundles = await Promise.all([...new Set([...assets, ...builtAssets])].map(verify))
const code = bundles.map(bytes => bytes.toString()).join('\n')
for (const feature of ['dumbbell_curl', 'arm_reps', '导出全部训练记录', 'wall_sit', 'v18-wall', '开始下一组', '静蹲进步跟踪', '云端备份', 'motion-coach.sync.v1', 'motion-coach:history', '正在上传历史记录', '重新连接并同步历史', '连接超过15秒']) {
  assert.ok(code.includes(feature), `Feature missing: ${feature}`)
}
console.log('PASS training auto sync, wall sit, curl and history export feature markers')
for (const feature of ['今天，练什么？', '主导航', '结束并保存', '按运动筛选', '每一次坚持，都有迹可循', 'record-sync-status', 'camera-viewport']) {
  assert.ok(code.includes(feature), `UI refresh missing: ${feature}`)
}
console.log('PASS light sage UI, navigation, uncropped camera and history screen markers')
const voices = (await readdir(resolve(dist, 'voice'))).filter(name => name.startsWith('v17-curl-') && name.endsWith('.mp3'))
assert.equal(voices.length, 9, 'Expected nine curl coaching voice clips')
for (const voice of voices) await verify(`voice/${voice}`)
const wallCues = ['start', 'ready', 'pause', 'goal', 'breathe', 'unclear', 'finished']
const wallVoices = (await readdir(resolve(dist, 'voice'))).filter(name => name.startsWith('v18-wall-') && name.endsWith('.mp3')).sort()
assert.deepEqual(wallVoices, wallCues.map(cue => `v18-wall-${cue}.mp3`).sort(), 'Expected all seven wall sit voice clips')
for (const voice of wallVoices) await verify(`voice/${voice}`)
await verify('mediapipe/pose_landmarker_lite.task')
for (const name of await readdir(resolve(dist, 'mediapipe/wasm'))) await verify(`mediapipe/wasm/${name}`)
console.log('PASS published application, wall sit/curl voices and pose model match local build')
