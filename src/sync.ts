import { readHistory, mergeHistory, type Session } from './history'
export type SyncConfig = { endpoint: string; token: string }
const CONFIG = 'motion-coach.sync.v1'
const ACK = 'motion-coach.sync.ack.v1'
export function getSyncConfig(): SyncConfig | null {
  try { const c = JSON.parse(localStorage.getItem(CONFIG) || 'null'); return c && typeof c.endpoint === 'string' && typeof c.token === 'string' ? c : null } catch { return null }
}
export function configureSync(c: SyncConfig | null) {
  if (c) {
    const url = new URL(c.endpoint)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || c.token.length < 32) throw new Error('请填写 HTTPS 接口地址和完整的同步密钥（至少32位）')
    localStorage.setItem(CONFIG, JSON.stringify({ endpoint: url.href.replace(/\/$/, ''), token: c.token.trim() }))
  } else localStorage.removeItem(CONFIG)
  localStorage.removeItem(ACK)
}
export async function syncHistory(c: SyncConfig, signal?: AbortSignal): Promise<number> {
  const request = async (query = '', session?: Session) => {
    const response = await fetch(c.endpoint + query, {
      method: session ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${c.token}`, ...(session ? { 'Content-Type': 'application/json' } : {}) },
      body: session ? JSON.stringify({ session }) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '同步密钥无效或权限不足，请检查设置' : `云端暂未接收（${response.status}），记录仍保存在本机`)
    return response.json()
  }
  let ack: Record<string,string> = {}
  try { const raw = JSON.parse(localStorage.getItem(ACK) || '{}'); if (raw && typeof raw === 'object' && !Array.isArray(raw)) ack = raw } catch { /* Resend safely by ID. */ }
  // IDs are final session IDs; acknowledge only after the server confirms durable storage.
  for (const session of readHistory()) {
    const fingerprint = JSON.stringify(session)
    if (ack[session.id] === fingerprint) continue
    const result = await request('', session)
    if (result.savedId !== session.id) throw new Error('云端确认不匹配，保留本地记录并等待重试')
    signal?.throwIfAborted()
    ack[session.id] = fingerprint
    localStorage.setItem(ACK, JSON.stringify(ack))
  }
  let cursor = ''
  const remote: Session[] = []
  const seen = new Set<string>()
  do {
    const page = await request(`?details=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    if (!Array.isArray(page.sessions) || !(page.nextCursor === null || typeof page.nextCursor === 'string')) throw new Error('云端返回格式异常，本地记录已保留')
    remote.push(...page.sessions)
    cursor = page.nextCursor || ''
    if (cursor && seen.has(cursor)) throw new Error('云端分页异常，请稍后重试')
    seen.add(cursor)
  } while (cursor)
  signal?.throwIfAborted()
  const merged = mergeHistory(remote)
  // A local session may have been saved while a request was in flight. Never acknowledge it here.
  const remoteMap = new Map(remote.map(s => [s.id, JSON.stringify(s)]))
  for (const s of merged) if (remoteMap.get(s.id) === JSON.stringify(s)) ack[s.id] = JSON.stringify(s)
  localStorage.setItem(ACK, JSON.stringify(ack))
  return merged.length
}
