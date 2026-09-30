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
const assets = [...html.matchAll(/(?:src|href)="\/ai-motion-coach\/(assets\/[^"\s]+)"/g)].map(match => match[1])
assert.ok(assets.some(path => path.endsWith('.js')), 'No application script found')
const bundles = await Promise.all(assets.map(verify))
const code = bundles.map(bytes => bytes.toString()).join('\n')
for (const feature of ['dumbbell_curl', 'arm_reps', '导出全部训练记录']) {
  assert.ok(code.includes(feature), `Feature missing: ${feature}`)
}
console.log('PASS curl and history export feature markers')
const voices = (await readdir(resolve(dist, 'voice'))).filter(name => name.startsWith('v17-curl-') && name.endsWith('.mp3'))
assert.equal(voices.length, 9, 'Expected nine curl coaching voice clips')
for (const voice of voices) await verify(`voice/${voice}`)
await verify('mediapipe/pose_landmarker_lite.task')
console.log('PASS published application, curl voices and pose model match local build')
