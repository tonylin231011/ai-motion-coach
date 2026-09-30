import type { Session } from './history'

function localDate(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildHistoryExport(sessions: Session[], exportedAt = new Date()) {
  return {
    format: 'ai-motion-coach-history' as const,
    schemaVersion: 1 as const,
    exportedAt: exportedAt.toISOString(),
    sessions: sessions.map(session => ({ ...session, localDate: localDate(session.endedAt) }))
  }
}

export function downloadHistoryExport(sessions: Session[]) {
  const payload = buildHistoryExport(sessions)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `ai-motion-coach-${localDate(Date.now())}.json`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
