import type { SessionDocument } from '~/types/telemetry'
import { gameScopedKey } from './gameIdentity'

export function normalizeTrackKey(track: string): string {
  return (track || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function buildLogicalSessionKey(meta: { date_start?: string; track?: string; gameId?: string; trackVariant?: string | null; car?: string; sourceSessionId?: string }): string {
  const dateKey = (meta?.date_start || '').split('.')[0]
  const trackKey = normalizeTrackKey(meta?.track || '')
  const legacyKey = `${dateKey}_${trackKey}`
  return !meta.gameId || meta.gameId === 'acc' ? legacyKey
    : gameScopedKey(meta.gameId, meta.sourceSessionId ?? '', meta.date_start ?? '', meta.track ?? '', meta.trackVariant ?? '', meta.car ?? '')
}

function toEpochMs(value: any): number {
  if (!value) return 0
  if (typeof value?.toMillis === 'function') {
    const millis = Number(value.toMillis())
    return Number.isFinite(millis) ? millis : 0
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function dedupeCloudSessions(cloudSessions: SessionDocument[]): SessionDocument[] {
  const byLogical = new Map<string, SessionDocument>()
  for (const session of cloudSessions) {
    const key = buildLogicalSessionKey(session.meta || {}) || session.sessionId
    const existing = byLogical.get(key)
    if (!existing) {
      byLogical.set(key, session)
      continue
    }
    const existingMs = toEpochMs(existing.uploadedAt)
    const incomingMs = toEpochMs(session.uploadedAt)
    if (incomingMs >= existingMs) {
      byLogical.set(key, session)
    }
  }
  return Array.from(byLogical.values())
}

export function mergeSessionLocalPreferred(localSession: SessionDocument, cloudSession: SessionDocument): SessionDocument {
  if ((localSession.meta.gameId ?? 'acc') !== (cloudSession.meta.gameId ?? 'acc')) {
    throw new Error('cross-game-session-merge')
  }
  if (localSession.meta.gameId && localSession.meta.gameId !== 'acc'
    && buildLogicalSessionKey(localSession.meta) !== buildLogicalSessionKey(cloudSession.meta)) {
    throw new Error('cross-context-session-merge')
  }
  return {
    ...cloudSession,
    ...localSession,
    meta: {
      ...(cloudSession.meta || {}),
      ...(localSession.meta || {})
    },
    summary: {
      ...(cloudSession.summary || {}),
      ...(localSession.summary || {})
    },
    source: 'local',
    syncState: localSession.syncState || cloudSession.syncState
  }
}

export function mergeSessionsDeterministic(
  localSessions: SessionDocument[],
  cloudSessions: SessionDocument[],
  options: { localWins: boolean; includeSyncedLocal: boolean }
): SessionDocument[] {
  const byLogical = new Map<string, SessionDocument>()
  const bySessionId = new Map<string, string>()
  const scopedId = (session: SessionDocument) => gameScopedKey(session.meta.gameId ?? 'acc', session.sessionId)

  const addCloud = (session: SessionDocument) => {
    const logicalKey = buildLogicalSessionKey(session.meta || {}) || session.sessionId
    byLogical.set(logicalKey, session)
    if (session.sessionId) bySessionId.set(scopedId(session), logicalKey)
  }

  const addLocal = (session: SessionDocument) => {
    if (!options.includeSyncedLocal && session.syncState === 'synced') return

    const logicalKey = buildLogicalSessionKey(session.meta || {}) || session.sessionId
    const idKey = session.sessionId ? bySessionId.get(scopedId(session)) : null
    const targetKey = idKey || logicalKey
    const existing = byLogical.get(targetKey)

    if (!existing) {
      byLogical.set(targetKey, session)
      if (session.sessionId) bySessionId.set(scopedId(session), targetKey)
      return
    }

    if (options.localWins) {
      byLogical.set(targetKey, mergeSessionLocalPreferred(session, existing))
      if (session.sessionId) bySessionId.set(scopedId(session), targetKey)
    }
  }

  for (const cloud of cloudSessions) addCloud(cloud)
  for (const local of localSessions) addLocal(local)

  const merged = Array.from(byLogical.values())
  merged.sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))
  return merged
}

export function mergeLocalFirst(localSessions: SessionDocument[], cloudSessions: SessionDocument[]): SessionDocument[] {
  return mergeSessionsDeterministic(localSessions, cloudSessions, {
    localWins: true,
    includeSyncedLocal: true
  })
}

export function mergePendingLocal(cloudPage: SessionDocument[], localSessions: SessionDocument[], includeLocal: boolean): SessionDocument[] {
  if (!includeLocal) return cloudPage
  const scopedId = (session: SessionDocument) => gameScopedKey(session.meta.gameId ?? 'acc', session.sessionId)
  const cloudIds = new Set(cloudPage.map(scopedId))
  const cloudLogicalKeys = new Set(cloudPage.map((session) => buildLogicalSessionKey(session.meta || {})))
  const pending = localSessions.filter((local) =>
    local.syncState !== 'synced'
      && !cloudIds.has(scopedId(local))
      && !cloudLogicalKeys.has(buildLogicalSessionKey(local.meta || {}))
  )
  const merged = [...pending, ...cloudPage]
  merged.sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))
  return merged
}
