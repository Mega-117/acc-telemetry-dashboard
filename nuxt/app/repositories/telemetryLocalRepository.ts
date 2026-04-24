import { extractMetadata, generateSessionId } from '~/utils/sessionParser'
import type { FullSession, SessionDocument } from '~/composables/useTelemetryData'
import { ensureLocalTelemetrySummariesCanonical } from '~/utils/localCanonicalSummary'

export function isSessionFileCandidate(fileName: string, rawObj: any): boolean {
  const normalized = (fileName || '').toLowerCase()
  if (!normalized.endsWith('.json')) return false
  if (normalized === 'live_state.json') return false
  if (!rawObj?.session_info?.date_start) return false
  if (!rawObj?.session_info?.track) return false
  return true
}

export async function loadLocalTelemetrySessions(params: {
  electronAPI: any
  ownerId?: string
  isOnline: boolean
}): Promise<SessionDocument[]> {
  const { electronAPI, ownerId, isOnline } = params
  if (!electronAPI?.getTelemetryFiles || !electronAPI?.readFile) return []

  await ensureLocalTelemetrySummariesCanonical()
  const files = await electronAPI.getTelemetryFiles()
  const registry = (await electronAPI.getRegistry?.()) || {}
  if (!Array.isArray(files) || files.length === 0) return []

  const sessions: SessionDocument[] = []
  for (const file of files) {
    try {
      const fileName = String(file?.name || '')
      const rawObj = await electronAPI.readFile(file.path)
      if (!rawObj || !isSessionFileCandidate(fileName, rawObj)) continue
      if (rawObj.ownerId && rawObj.ownerId !== ownerId) continue

      const { meta, summary, summarySource } = extractMetadata(rawObj)
      const sessionId = generateSessionId(meta.date_start, meta.track)
      const reg = registry[fileName]
      const isSynced = !!(reg && reg.uploadedBy === ownerId && reg.sessionId === sessionId)

      sessions.push({
        sessionId,
        fileHash: '',
        fileName,
        uploadedAt: null,
        meta,
        summary,
        rawChunkCount: 0,
        rawSizeBytes: 0,
        source: 'local',
        summarySource,
        syncState: isSynced ? 'synced' : (isOnline ? 'pending_sync' : 'local_only')
      } as SessionDocument)
    } catch {
      // Keep repository resilient on malformed files.
    }
  }

  sessions.sort((a, b) => (b.meta?.date_start || '').localeCompare(a.meta?.date_start || ''))
  return sessions
}

export async function findLocalFullSessionById(params: {
  electronAPI: any
  sessionId: string
  ownerId?: string
}): Promise<FullSession | null> {
  const { electronAPI, sessionId, ownerId } = params
  if (!electronAPI?.getTelemetryFiles || !electronAPI?.readFile) return null

  await ensureLocalTelemetrySummariesCanonical()
  const files = await electronAPI.getTelemetryFiles()
  for (const file of files || []) {
    const fileName = String(file?.name || '')
    if (fileName.toLowerCase() === 'live_state.json') continue
    const rawObj = await electronAPI.readFile(file.path)
    if (!rawObj || !isSessionFileCandidate(fileName, rawObj)) continue
    if (rawObj.ownerId && rawObj.ownerId !== ownerId) continue

    const sessionInfo = rawObj.session_info || {}
    const localSessionId = generateSessionId(
      sessionInfo.date_start || rawObj.date || '',
      sessionInfo.track || rawObj.track || ''
    )

    if (localSessionId === sessionId) {
      return rawObj as FullSession
    }
  }

  return null
}
