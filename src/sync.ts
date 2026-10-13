import { readHistory, mergeHistory, type Session } from './history'
export type SyncConfig = { endpoint: string; token: string }
export type SyncProgress = { stage: 'uploading' | 'reading'; completed: number; total: number }
export const DEFAULT_SYNC_ENDPOINT = 'https://nanbuqu-dashboard-d0drnae5202324-1433064673.ap-shanghai.app.tcloudbase.com/training-sync'
const CONFIG = 'motion-coach.sync.v1'
const ACK = 'motion-coach.sync.ack.v1'
export function getSyncConfig(): SyncConfig | null {
  try { const c = JSON.parse(localStorage.getItem(CONFIG) || 'null'); return c && typeof c.endpoint === 'string' && typeof c.token === 'string' ? c : null } catch { return null }
}
export function configureSync(c: SyncConfig | null) {
  if (c) {
    let url: URL
    try { url = new URL(c.endpoint.trim()) } catch { throw new Error('同步接口格式不正确，请只填写 https:// 开头的接口地址') }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('同步接口必须是 HTTPS 地址，不能包含密钥、查询参数或登录信息')
    const token = c.token.trim()
    if (token.length < 32 || /\s/.test(token)) throw new Error('同步密钥不完整，请只复制密钥本身（至少32位），不要包含标题或空格')
    localStorage.setItem(CONFIG, JSON.stringify({ endpoint: url.href.replace(/\/$/, ''), token }))
  } else localStorage.removeItem(CONFIG)
  localStorage.removeItem(ACK)
}
function cancelled() { const error = new Error('同步已取消，本地记录保留'); error.name = 'AbortError'; return error }
function checkCancelled(signal?: AbortSignal) { if (signal?.aborted) throw cancelled() }
export async function syncHistory(c: SyncConfig, signal?: AbortSignal, onProgress?: (progress: SyncProgress) => void): Promise<number> {
  const request = async (query = '', session?: Session) => {
    checkCancelled(signal)
    // Basic AbortController + timer works on older phone browsers, without newer AbortSignal helpers.
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>, timedOut = false
    let cancel = () => {}
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => { controller.abort(); reject(cancelled()) }
      signal?.addEventListener('abort', cancel)
      timer = setTimeout(() => {
        timedOut = true; controller.abort()
        reject(new Error('连接超过15秒未响应，稍后自动重试；本地记录保留'))
      }, 15000)
    })
    try {
      const response = await Promise.race([fetch(c.endpoint + query, {
        method: session ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${c.token}`, ...(session ? { 'Content-Type': 'application/json' } : {}) },
        body: session ? JSON.stringify({ session }) : undefined, signal: controller.signal,
      }), interrupted])
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '同步密钥无效或权限不足，请检查设置' : `云端暂未接收（${response.status}）${session ? `，记录编号 ${session.id}` : ''}；本地记录保留`)
      const data = await Promise.race([response.json(), interrupted])
      checkCancelled(signal)
      return data
    } catch (error) {
      checkCancelled(signal)
      if (timedOut) throw new Error('连接超过15秒未响应，稍后自动重试；本地记录保留')
      if (error instanceof TypeError) throw new Error('无法连接云端，请检查网络与接口地址；稍后自动重试，本地记录保留')
      if (error instanceof SyntaxError) throw new Error('接口未返回有效的训练数据，请检查同步接口地址；本地记录保留')
      throw error
    } finally { clearTimeout(timer!); signal?.removeEventListener('abort', cancel) }
  }
  let ack: Record<string,string> = {}
  try { const raw = JSON.parse(localStorage.getItem(ACK) || '{}'); if (raw && typeof raw === 'object' && !Array.isArray(raw)) ack = raw } catch { /* Resend safely by ID. */ }
  // IDs are final session IDs; acknowledge only after the server confirms durable storage.
  const pending = readHistory().filter(session => ack[session.id] !== JSON.stringify(session))
  let completed = 0
  for (const session of pending) {
    onProgress?.({ stage: 'uploading', completed, total: pending.length })
    const fingerprint = JSON.stringify(session)
    const result = await request('', session)
    if (result.savedId !== session.id) throw new Error('云端确认不匹配，保留本地记录并等待重试')
    checkCancelled(signal)
    ack[session.id] = fingerprint
    localStorage.setItem(ACK, JSON.stringify(ack))
    onProgress?.({ stage: 'uploading', completed: ++completed, total: pending.length })
  }
  let cursor = ''
  const remote: Session[] = []
  const seen = new Set<string>()
  do {
    onProgress?.({ stage: 'reading', completed: remote.length, total: remote.length })
    const page = await request(`?details=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    if (!Array.isArray(page.sessions) || !(page.nextCursor === null || typeof page.nextCursor === 'string')) throw new Error('云端返回格式异常，本地记录已保留')
    remote.push(...page.sessions)
    cursor = page.nextCursor || ''
    if (cursor && seen.has(cursor)) throw new Error('云端分页异常，请稍后重试')
    seen.add(cursor)
  } while (cursor)
  checkCancelled(signal)
  const merged = mergeHistory(remote)
  // A local session may have been saved while a request was in flight. Never acknowledge it here.
  const remoteMap = new Map(remote.map(s => [s.id, JSON.stringify(s)]))
  for (const s of merged) if (remoteMap.get(s.id) === JSON.stringify(s)) ack[s.id] = JSON.stringify(s)
  localStorage.setItem(ACK, JSON.stringify(ack))
  return merged.length
}
