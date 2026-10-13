import { useEffect, useRef, useState } from 'react'
import { configureSync, DEFAULT_SYNC_ENDPOINT, getSyncConfig, syncHistory } from './sync'
export function SyncPanel({ onSynced, disabled }: { onSynced: () => void; disabled: boolean }) {
  const [config, setConfig] = useState(getSyncConfig)
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? DEFAULT_SYNC_ENDPOINT)
  const [token, setToken] = useState('')
  const [status, setStatus] = useState(config ? '准备同步' : '仅保存在本机 · 尚未连接云端')
  const [busy, setBusy] = useState(false)
  const callback = useRef(onSynced); callback.current = onSynced
  const retry = useRef<(() => void) | null>(null)
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
        const count = await syncHistory(config, controller.signal, progress => {
          if (!controller.signal.aborted) setStatus(progress.stage === 'uploading'
            ? `正在上传历史记录：${progress.completed} / ${progress.total} 条…`
            : `正在读取云端记录… 已收到 ${progress.completed} 条`)
        })
        if (controller.signal.aborted) return
        failures = 0; setStatus(`云端已同步 · 共 ${count} 条 · ${new Date().toLocaleTimeString('zh-CN')}`); callback.current()
      } catch (error) {
        if (controller.signal.aborted) return
        failures++; setStatus(error instanceof Error && error.name === 'QuotaExceededError'
          ? '浏览器存储空间不足，请先导出备份；不要清除站点数据'
          : `${error instanceof Error ? error.message : '同步失败'}（稍后自动重试）`)
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
    const trigger = () => { void run() }
    window.addEventListener('motion-coach:history', trigger)
    window.addEventListener('online', trigger)
    document.addEventListener('visibilitychange', visible)
    void run()
    return () => {
      controller.abort(); clearTimeout(timer)
      retry.current = null
      window.removeEventListener('motion-coach:history', trigger)
      window.removeEventListener('online', trigger)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [config])
  return <details className="sync-panel">
    <summary>云端备份 <span>{status}</span></summary>
    <p>首次连接后自动补传本机历史；以后训练结束自动同步。另一台设备填写相同配置即可查看。密钥保存在此浏览器，请只在自己的设备连接。</p>
    <form noValidate onSubmit={e => {
      e.preventDefault()
      setStatus('正在保存连接设置…')
      try {
        const url = new URL(endpoint.trim()).href.replace(/\/$/, '')
        // Never reuse the saved secret for a different endpoint.
        const secret = token.trim() || (config?.endpoint === url ? config.token : '')
        configureSync({ endpoint: url, token: secret })
        setConfig(getSyncConfig()); setToken(''); setStatus('设置已保存，正在连接云端…')
      }
      catch (error) { setStatus(error instanceof TypeError
        ? '同步接口格式不正确，请只填写 https:// 开头的接口地址'
        : error instanceof Error && error.name === 'QuotaExceededError'
          ? '浏览器存储空间不足，未能保存连接设置；请先导出备份，不要清除站点数据'
          : error instanceof Error ? error.message : '未能保存连接设置，请重试') }
    }}>
      <label>同步接口 <input type="url" required value={endpoint} placeholder="https://…/training-sync" onChange={e => setEndpoint(e.target.value)} disabled={disabled || busy} /></label>
      <label>同步密钥 <input type="password" autoComplete="off" required minLength={32} value={token} onChange={e => setToken(e.target.value)} disabled={disabled || busy} /></label>
      <button type="submit" disabled={disabled || busy}>{busy ? '正在同步…' : config ? '重新连接并同步历史' : '连接并同步历史'}</button>
      {config && <><button type="button" disabled={disabled || busy} onClick={() => {
        setStatus('正在准备同步…')
        if (retry.current) retry.current()
        else setConfig({ ...config })
      }}>立即同步</button><button type="button" disabled={disabled || busy} onClick={() => {
        try { configureSync(null); setConfig(null); setStatus('已断开 · 本机和云端历史均保留') }
        catch { setStatus('无法移除本机连接设置，请稍后重试；训练记录保留') }
      }}>断开连接</button></>}
    </form>
    <p className="sync-feedback" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    {disabled && <p>请先结束训练，再配置或手动同步；训练记录仍会在保存后自动同步。</p>}
    {config && <p>密钥已保存在此浏览器，输入框留空也可重新连接同一接口；只有更换接口或密钥时才需重新填写。</p>}
  </details>
}
