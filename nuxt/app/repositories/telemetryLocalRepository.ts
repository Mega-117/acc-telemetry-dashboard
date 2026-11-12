import { extractMetadata, generateSessionId } from '~/utils/sessionParser'
import type { FullSession, SessionDocument } from '~/types/telemetry'
import { ensureLocalTelemetrySummariesCanonical } from '~/utils/localCanonicalSummary'
import { isRegistryEntryCurrentForFile } from '~/services/sync/syncRegistryPolicy'
import { recordingGame } from '~/services/telemetry/gameIdentity'
import { parseTelemetryDate } from '~/utils/telemetryFormat'

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
  if (!ownerId || !electronAPI?.getTelemetryFiles || !electronAPI?.readFile) return []

  await ensureLocalTelemetrySummariesCanonical()
  const files = await electronAPI.getTelemetryFiles()
  const registry = (await electronAPI.getRegistry?.()) || {}
  if (!Array.isArray(files) || files.length === 0) return []

  const sessions: SessionDocument[] = []
  for (const file of files) {
    try {
      const fileName = String(file?.name || '')
      const rawObj = await electronAPI.readFile(fileName)
      if (!rawObj || !isSessionFileCandidate(fileName, rawObj)) continue
      if (typeof rawObj.ownerId !== 'string' || rawObj.ownerId !== ownerId) continue

      const { meta, summary, summarySource } = extractMetadata(rawObj)
      const sessionId = generateSessionId(meta.date_start, meta.track, meta.gameId, meta)
      const reg = registry[fileName]
      const isSynced = isRegistryEntryCurrentForFile({
        entry: reg,
        file,
        ownerId,
        sessionId,
        minimumBestRulesVersion: meta.gameId === 'acc' ? undefined : 1
      })

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

/** How many recent files are opened, newest first, to find one with a lap (PIP-767). */
const NEWEST_SESSION_READS = 3

export class RecentSessionsUnavailableError extends Error {
  constructor() { super('recent-sessions-unavailable') }
}

/**
 * PIP-767: the newest own session of `gameId` with at least one lap on this computer, read at the
 * moment it is asked (the Panoramica's "Ultima sessione" click). The program describes only the
 * files written last (the running session is rewritten at every lap); here at most a few of them are
 * opened, newest first, and the id is built the same way as the Sessioni list builds it.
 * `newestStart` is the start of the newest one with laps according to the program's own description
 * (its lap counter), independent of what was opened here: the spy's measure of a wrong destination.
 * Throws RecentSessionsUnavailableError when the program could not answer.
 */
/** One file described by the program (PIP-767: name, start, game and its own lap counter). */
type RecentSessionFile = { name?: unknown; dateStart?: unknown; game?: unknown; laps?: unknown }
type RecentSessionsProgram = {
  getRecentSessionFiles?: () => Promise<{ ok?: boolean; files?: RecentSessionFile[]; retry?: number } | null>
  readFile?: (fileName: string) => Promise<Record<string, unknown> | null>
}

export async function findNewestLocalSession(params: {
  electronAPI: RecentSessionsProgram | null | undefined
  ownerId?: string
  gameId: string
}): Promise<{ session: { id: string; date: string } | null; newestStart: string | null; complete: boolean }> {
  const { electronAPI, ownerId, gameId } = params
  if (!ownerId || !electronAPI?.getRecentSessionFiles || !electronAPI?.readFile) throw new RecentSessionsUnavailableError()
  const recent = await electronAPI.getRecentSessionFiles()
  if (!recent?.ok || !Array.isArray(recent.files)) throw new RecentSessionsUnavailableError()
  const startOf = (value: unknown) => (typeof value === 'string' ? parseTelemetryDate(value)?.getTime() : undefined) ?? Number.NaN
  // A described lap counter of 0 is a session not driven yet; an older program has no counter: read it.
  const candidates = recent.files
    .filter((file): file is RecentSessionFile & { name: string; dateStart: string } => file?.game === gameId
      && typeof file?.name === 'string' && typeof file?.dateStart === 'string' && Number.isFinite(startOf(file.dateStart))
      && (file.laps === null || file.laps === undefined || Number(file.laps) > 0))
    .sort((a, b) => startOf(b.dateStart) - startOf(a.dateStart))
  const newestStart = candidates.find(file => Number(file.laps) > 0)?.dateStart ?? null
  // A file the program could not read as a session may be the newest one: the spy is told.
  const complete = !(Number(recent.retry) > 0)
  for (const file of candidates.slice(0, NEWEST_SESSION_READS)) {
    try {
      const rawObj = await electronAPI.readFile(file.name)
      if (!rawObj || !isSessionFileCandidate(file.name, rawObj) || rawObj.ownerId !== ownerId) continue
      if (recordingGame(rawObj) !== gameId) continue
      const { meta, summary } = extractMetadata(rawObj)
      if (Number(summary?.laps || 0) <= 0) continue
      return { session: { id: generateSessionId(meta.date_start, meta.track, meta.gameId, meta), date: meta.date_start }, newestStart, complete }
    } catch {
      // One unreadable file leaves the next one to answer; `newestStart` still tells the spy.
    }
  }
  return { session: null, newestStart, complete }
}

export async function findLocalFullSessionById(params: {
  electronAPI: any
  sessionId: string
  ownerId?: string
}): Promise<FullSession | null> {
  const { electronAPI, sessionId, ownerId } = params
  if (!ownerId || !electronAPI?.getTelemetryFiles || !electronAPI?.readFile) return null

  await ensureLocalTelemetrySummariesCanonical()
  const files = await electronAPI.getTelemetryFiles()
  for (const file of files || []) {
    const fileName = String(file?.name || '')
    if (fileName.toLowerCase() === 'live_state.json') continue
    const rawObj = await electronAPI.readFile(fileName)
    if (!rawObj || !isSessionFileCandidate(fileName, rawObj)) continue
    if (typeof rawObj.ownerId !== 'string' || rawObj.ownerId !== ownerId) continue

    const sessionInfo = rawObj.session_info || {}
    const localSessionId = generateSessionId(
      sessionInfo.date_start || rawObj.date || '',
      sessionInfo.track || rawObj.track || '',
      recordingGame(rawObj) ?? 'unknown',
      extractMetadata(rawObj).meta
    )

    if (localSessionId === sessionId) {
      return rawObj as FullSession
    }
  }

  return null
}
