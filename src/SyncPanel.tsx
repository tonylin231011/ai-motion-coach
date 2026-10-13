import { useEffect, useRef, useState } from 'react'
import { configureSync, getSyncConfig, syncHistory } from './sync'
export function SyncPanel({ onSynced, disabled }: { onSynced: () => void; disabled: boolean }) {
  const [config, setConfig] = useState(getSyncConfig)
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? '')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState(config ? '准备同步' : '仅保存在本机 · 尚未连接云端')
  const [busy, setBusy] = useState(false)
  const callback = useRef(onSynced); callback.current = onSynced
  const retry = useRef<() => void>(() => {})
  useEffect(() => {
    if (!config) return
    const controller = new AbortController()
    let running = false, again = false, timer: ReturnType<typeof setTimeout>, failures = 0
    const run = async () => {
      if (controller.signal.aborted) return
      if (running) { again = true; return }
      clearTimeout(timer)
      if (!navigator.onLine) { setStatus('等待联网 · 记录已保存在本机'); return }
      running = true; setBusy(true); setStatus('正在同步训练记录…')
      try {
        const count = await syncHistory(config, controller.signal)
        if (controller.signal.aborted) return
        failures = 0; setStatus(`云端已同步 · 共 ${count} 条 · ${new Date().toLocaleTimeString('zh-CN')}`); callback.current()
      } catch (error) {
        if (controller.signal.aborted) return
        failures++; setStatus(error instanceof Error ? error.message : '同步失败，稍后自动重试')
      } finally {
        running = false
        if (!controller.signal.aborted) {
          setBusy(false)
          timer = setTimeout(run, again ? 0 : failures ? Math.min(300000, 5000 * 2 ** Math.min(failures, 6)) : 60000)
          again = false
        }
      }
    }
    const visible = () => { if (document.visibilityState === 'visible') void run() }
    retry.current = () => { void run() }
    window.addEventListener('motion-coach:history', retry.current)
    window.addEventListener('online', retry.current)
    document.addEventListener('visibilitychange', visible)
    void run()
    return () => {
      controller.abort(); clearTimeout(timer)
      window.removeEventListener('motion-coach:history', retry.current)
      window.removeEventListener('online', retry.current)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [config])
  return <details className="sync-panel">
    <summary>云端备份 <span role="status" aria-live="polite">{status}</span></summary>
    <p>首次连接后自动补传本机历史；以后训练结束自动同步。另一台设备填写相同配置即可查看。密钥保存在此浏览器，请只在自己的设备连接。</p>
    <form onSubmit={e => {
      e.preventDefault()
      try { configureSync({ endpoint: endpoint.trim(), token: token.trim() }); setConfig(getSyncConfig()); setToken('') }
      catch (error) { setStatus((error as Error).message) }
    }}>
      <label>同步接口 <input type="url" required value={endpoint} placeholder="https://…/training-sync" onChange={e => setEndpoint(e.target.value)} disabled={disabled || busy} /></label>
      <label>同步密钥 <input type="password" autoComplete="off" required minLength={32} value={token} onChange={e => setToken(e.target.value)} disabled={disabled || busy} /></label>
      <button disabled={disabled || busy}>连接并同步历史</button>
      {config && <><button type="button" disabled={disabled || busy} onClick={() => retry.current()}>立即同步</button><button type="button" disabled={disabled || busy} onClick={() => { configureSync(null); setConfig(null); setStatus('已断开 · 本机和云端历史均保留') }}>断开连接</button></>}
    </form>
  </details>
}
