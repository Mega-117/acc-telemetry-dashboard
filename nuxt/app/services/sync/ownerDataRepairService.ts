import { collection, doc, limit, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import {
  trackedDeleteDoc,
  trackedGetDoc,
  trackedGetDocs,
  trackedSetDoc,
  withFirebaseScenario
} from '~/composables/useFirebaseTracker'
import type { SessionDocument } from '~/composables/useTelemetryData'
import { BEST_RULES_VERSION, extractMetadata } from '~/utils/sessionParser'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import { canonicalizeTelemetryPayload } from './canonicalSummaryBridge'
import { reconstructRawPayloadFromChunks } from './legacySummaryMigrationService'
import { buildUserStatsProjection, USER_STATS_SCHEMA_VERSION } from './userStatsProjectionService'
import { SESSION_INDEX_SCHEMA_VERSION } from './sessionIndexProjectionService'
import {
  applyTrackBestsProjectionDeltas,
  TRACK_BESTS_SCHEMA_VERSION,
  type TrackBestProjectionDelta
} from './trackBestsProjectionService'
import { TRACK_DETAIL_PROJECTION_SCHEMA_VERSION } from '~/types/trackProjections'
import { writeUserProjectionDocuments } from './projectionRebuildService'
import { writePilotDirectoryFromUser } from '~/services/pilotDirectoryProjectionService'
import {
  SESSION_LIST_PROJECTION_PAGE_SIZE,
  SESSION_LIST_PROJECTION_SCHEMA_VERSION,
  writeSessionListProjectionDocuments
} from './sessionListProjectionService'

const CALLER = 'OwnerDataRepair'
const MAX_ISSUES = 200
const RAW_PROBE_CONCURRENCY = 8

export interface OwnerDataAuditReport {
  generatedAt: string
  uid: string
  sessions: {
    total: number
    canonical: number
    legacy: number
    missingCanonical: number
    incompleteCloudOnly: number
    zeroLaps: number
  }
  rawChunks: {
    present: number
    missing: number
    unknown: number
    probed: number
  }
  projections: {
    statsSchemaVersion: number
    sessionIndexSchemaVersion: number
    expectedSessionIndexSchemaVersion: number
    sessionListSchemaVersion: number
    expectedSessionListSchemaVersion: number
    sessionListTotalSessions: number
    sessionListPageDocs: number
    expectedSessionListPageDocs: number
    expectedStatsSchemaVersion: number
    trackBestsSchemaVersion: number
    trackDetailProjectionSchemaVersion: number
    trackBestsDocs: number
    trackDetailProjectionDocs: number
    missingTrackBests: string[]
    oldTrackBests: string[]
    missingTrackDetailProjections: string[]
    oldTrackDetailProjections: string[]
  }
  permissions: {
    user: 'ok' | 'denied'
    sessions: 'ok' | 'denied'
    trackBests: 'ok' | 'denied'
    trackDetailProjections: 'ok' | 'denied'
    sessionListProjection: 'ok' | 'denied'
    rawChunks: 'ok' | 'partial' | 'denied'
  }
  issues: Array<{
    severity: 'info' | 'warning' | 'error'
    code: string
    message: string
    sessionId?: string
    trackId?: string
  }>
  canRebuildProjections: boolean
  canReprocessFromCloudRaw: boolean
}

export interface OwnerProjectionRebuildReport {
  generatedAt: string
  uid: string
  sessionCount: number
  trackCount: number
  deletedTrackBests: number
  deletedTrackDetailProjections: number
  updatedTrackBests: string[]
  touchedTrackBests: string[]
  wroteUserProjection: boolean
  wrotePilotDirectory: boolean
}

export interface OwnerSessionListProjectionRebuildReport {
  generatedAt: string
  uid: string
  sessionCount: number
  pageCount: number
  pageSize: number
}

export interface OwnerLightweightVerificationReport {
  generatedAt: string
  uid: string
  ok: boolean
  userSchemas: {
    statsSchemaVersion: number
    sessionIndexSchemaVersion: number
    sessionListSchemaVersion: number
    expectedStatsSchemaVersion: number
    expectedSessionIndexSchemaVersion: number
    expectedSessionListSchemaVersion: number
  }
  projections: {
    trackBestsDocs: number
    trackDetailProjectionDocs: number
    sessionListPageDocs: number
    oldTrackBests: string[]
    oldTrackDetailProjections: string[]
  }
  issues: string[]
}

export interface OwnerCloudSummaryReprocessReport {
  generatedAt: string
  uid: string
  forceAll: boolean
  scannedSessions: number
  eligibleSessions: number
  processedSessions: number
  updatedSessions: number
  unchangedSessions: number
  skippedNoRaw: number
  failedSessions: number
  canonicalizedByLocalDomain: number
  canonicalizedByCloudRawFallback: number
  errors: Array<{
    sessionId: string
    message: string
  }>
}

export interface OwnerCloudSummaryReprocessOptions {
  forceAll?: boolean
}

function issue(
  severity: 'info' | 'warning' | 'error',
  code: string,
  message: string,
  extra: { sessionId?: string; trackId?: string } = {}
): OwnerDataAuditReport['issues'][number] {
  return { severity, code, message, ...extra }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function getDocTracked(ref: any) {
  return trackedGetDoc(ref, CALLER)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function getDocsTracked(q: any) {
  return trackedGetDocs(q, CALLER)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function setDocTracked(ref: any, data: any, options?: any) {
  if (options) {
    return trackedSetDoc(ref, data, options, CALLER)
  }
  return trackedSetDoc(ref, data, CALLER)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function deleteDocTracked(ref: any) {
  return trackedDeleteDoc(ref, CALLER)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function toSessionDocument(docSnap: any): SessionDocument {
  const data = docSnap.data() || {}
  return {
    sessionId: docSnap.id,
    fileHash: data.fileHash || '',
    fileName: data.fileName || '',
    uploadedAt: data.uploadedAt || null,
    meta: data.meta || {},
    summary: data.summary || {},
    rawChunkCount: Number(data.rawChunkCount || 0),
    rawSizeBytes: Number(data.rawSizeBytes || 0),
    source: 'cloud',
    summarySource: Number(data?.summary?.best_rules_version || data?.summaryRulesVersion || 0) >= BEST_RULES_VERSION
      ? 'canonical'
      : 'legacy_fallback',
    syncState: 'synced'
  } as SessionDocument
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function stableJson(value: any): string {
  return JSON.stringify(sanitizeForFirestore(value))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function canonicalizeCloudRawPayload(rawObj: any): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  meta: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  summary: any
  mode: 'local_domain' | 'cloud_raw_fallback'
} | null> {
  const parsed = extractMetadata(rawObj, { allowLegacyFallback: true, forceRawRebuild: true })

  try {
    const localDomainResult = await canonicalizeTelemetryPayload(rawObj)
    if (localDomainResult?.ok && localDomainResult.summary) {
      return {
        meta: parsed.meta,
        summary: {
          ...localDomainResult.summary,
          best_rules_version: Number(localDomainResult.summary.best_rules_version || BEST_RULES_VERSION)
        },
        mode: 'local_domain'
      }
    }
  } catch {
    // Browser-only owner rebuild can still canonicalize from cloud raw chunks.
  }

  return {
    meta: parsed.meta,
    summary: {
      ...parsed.summary,
      best_rules_version: Number(parsed.summary.best_rules_version || BEST_RULES_VERSION)
    },
    mode: 'cloud_raw_fallback'
  }
}

async function loadOwnerSessions(uid: string): Promise<SessionDocument[]> {
  const snap = await getDocsTracked(query(collection(db, `users/${uid}/sessions`)))
  return (snap.docs || []).map(toSessionDocument)
}

async function loadCollectionDocs(path: string): Promise<any[]> {
  const snap = await getDocsTracked(query(collection(db, path)))
  return snap.docs || []
}

async function deleteCollectionDocs(path: string): Promise<number> {
  const docs = await loadCollectionDocs(path)
  for (const docSnap of docs) {
    await deleteDocTracked(docSnap.ref)
  }
  return docs.length
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let index = 0

  async function run() {
    while (index < items.length) {
      const currentIndex = index++
      results[currentIndex] = await worker(items[currentIndex]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, run))
  return results
}

async function probeRawChunks(uid: string, session: SessionDocument): Promise<'present' | 'missing' | 'denied'> {
  try {
    const chunksRef = collection(db, `users/${uid}/sessions/${session.sessionId}/rawChunks`)
    const snap = await getDocsTracked(query(chunksRef, limit(1)))
    return (snap.docs || []).length > 0 ? 'present' : 'missing'
  } catch {
    return 'denied'
  }
}

function getTrackIdsFromSessions(sessions: SessionDocument[]): string[] {
  return Array.from(new Set(
    sessions
      .map((session) => normalizeTrackId(session.meta?.track || ''))
      .filter(Boolean)
  )).sort()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function toDocMap(docs: any[]): Map<string, any> {
  const result = new Map<string, any>()
  for (const docSnap of docs) {
    result.set(normalizeTrackId(docSnap.id), docSnap.data() || {})
  }
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export function isLegacyTrackBestProjectionDoc(data: any): boolean {
  return Number(data?.version || 0) < TRACK_BESTS_SCHEMA_VERSION
    || Number(data?.bestRulesVersion || 0) < BEST_RULES_VERSION
}

export async function auditOwnerData(uid: string): Promise<OwnerDataAuditReport> {
  return withFirebaseScenario('dev.ownerRebuild.audit', { uid }, async () => {
    const issues: OwnerDataAuditReport['issues'] = []
    const permissions: OwnerDataAuditReport['permissions'] = {
      user: 'ok',
      sessions: 'ok',
      trackBests: 'ok',
      trackDetailProjections: 'ok',
      sessionListProjection: 'ok',
      rawChunks: 'ok'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    let userData: any = {}
    try {
      const userSnap = await getDocTracked(doc(db, `users/${uid}`))
      userData = userSnap.exists() ? (userSnap.data() || {}) : {}
      if (!userSnap.exists()) {
        issues.push(issue('error', 'missing_user_doc', 'Documento users/{uid} mancante.'))
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    } catch (error: any) {
      permissions.user = 'denied'
      issues.push(issue('error', 'user_doc_denied', error?.message || 'Permessi insufficienti su users/{uid}.'))
    }

    let sessions: SessionDocument[] = []
    try {
      sessions = await loadOwnerSessions(uid)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    } catch (error: any) {
      permissions.sessions = 'denied'
      issues.push(issue('error', 'sessions_denied', error?.message || 'Permessi insufficienti su users/{uid}/sessions.'))
    }

    const trackIds = getTrackIdsFromSessions(sessions)
    const rawStats = { present: 0, missing: 0, unknown: 0, probed: 0 }
    const sessionsNeedingRawProbe = sessions.filter((session) => Number(session.rawChunkCount || 0) <= 0 && Number(session.rawSizeBytes || 0) <= 0)

    for (const session of sessions) {
      if (Number(session.rawChunkCount || 0) > 0 || Number(session.rawSizeBytes || 0) > 0) {
        rawStats.present += 1
      }
    }

    const rawProbeResults = await mapWithConcurrency(sessionsNeedingRawProbe, RAW_PROBE_CONCURRENCY, async (session) => {
      const result = await probeRawChunks(uid, session)
      return { session, result }
    })
    rawStats.probed = rawProbeResults.length
    for (const { session, result } of rawProbeResults) {
      if (result === 'present') rawStats.present += 1
      if (result === 'missing') {
        rawStats.missing += 1
        if (issues.length < MAX_ISSUES) {
          issues.push(issue('warning', 'missing_raw_chunks', 'Sessione senza rawChunks rilevabili.', { sessionId: session.sessionId }))
        }
      }
      if (result === 'denied') {
        rawStats.unknown += 1
        permissions.rawChunks = permissions.rawChunks === 'ok' ? 'partial' : permissions.rawChunks
      }
    }
    if (rawProbeResults.some((item) => item.result === 'denied') && rawProbeResults.every((item) => item.result === 'denied')) {
      permissions.rawChunks = 'denied'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    let trackBestDocs: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    let trackDetailDocs: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    let sessionListPageDocs: any[] = []
    let sessionListSchemaVersion = 0
    let sessionListTotalSessions = 0
    try {
      trackBestDocs = await loadCollectionDocs(`users/${uid}/trackBests`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    } catch (error: any) {
      permissions.trackBests = 'denied'
      issues.push(issue('error', 'track_bests_denied', error?.message || 'Permessi insufficienti su trackBests.'))
    }
    try {
      trackDetailDocs = await loadCollectionDocs(`users/${uid}/trackDetailProjections`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    } catch (error: any) {
      permissions.trackDetailProjections = 'denied'
      issues.push(issue('error', 'track_detail_projection_denied', error?.message || 'Permessi insufficienti su trackDetailProjections.'))
    }
    try {
      const sessionListMetaSnap = await getDocTracked(doc(db, `users/${uid}/sessionListMeta/v1`))
      const sessionListMeta = sessionListMetaSnap.exists() ? (sessionListMetaSnap.data() || {}) : {}
      sessionListSchemaVersion = Number(sessionListMeta.schemaVersion || 0)
      sessionListTotalSessions = Number(sessionListMeta.totalSessions || 0)
      sessionListPageDocs = await loadCollectionDocs(`users/${uid}/sessionListPages`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    } catch (error: any) {
      permissions.sessionListProjection = 'denied'
      issues.push(issue('error', 'session_list_projection_denied', error?.message || 'Permessi insufficienti su sessionList projection.'))
    }

    const trackBestMap = toDocMap(trackBestDocs)
    const trackDetailMap = toDocMap(trackDetailDocs)
    const missingTrackBests = trackIds.filter((trackId) => !trackBestMap.has(trackId))
    const missingTrackDetailProjections = trackIds.filter((trackId) => !trackDetailMap.has(trackId))
    const expectedSessionListPageDocs = Math.ceil(sessions.length / SESSION_LIST_PROJECTION_PAGE_SIZE)
    const oldTrackBests = Array.from(trackBestMap.entries())
      .filter(([, data]) => isLegacyTrackBestProjectionDoc(data))
      .map(([trackId]) => trackId)
    const oldTrackDetailProjections = Array.from(trackDetailMap.entries())
      .filter(([, data]) => Number(data?.schemaVersion || 0) !== TRACK_DETAIL_PROJECTION_SCHEMA_VERSION)
      .map(([trackId]) => trackId)

    for (const trackId of missingTrackBests.slice(0, MAX_ISSUES)) {
      issues.push(issue('warning', 'missing_track_bests', 'Pista con sessioni ma senza trackBests.', { trackId }))
    }
    for (const trackId of missingTrackDetailProjections.slice(0, MAX_ISSUES)) {
      issues.push(issue('warning', 'missing_track_detail_projection', 'Pista con sessioni ma senza trackDetailProjection.', { trackId }))
    }
    for (const trackId of oldTrackBests.slice(0, MAX_ISSUES)) {
      issues.push(issue('warning', 'old_track_bests', 'Pista con trackBests schema/regole legacy.', { trackId }))
    }
    if (sessionListSchemaVersion !== SESSION_LIST_PROJECTION_SCHEMA_VERSION) {
      issues.push(issue('warning', 'session_list_schema_mismatch', 'Session list projection mancante o con schema vecchio.'))
    }
    if (sessionListPageDocs.length < expectedSessionListPageDocs || sessionListTotalSessions !== sessions.length) {
      issues.push(issue('warning', 'session_list_incomplete', 'Session list projection incompleta rispetto alle sessioni cloud.'))
    }

    let canonical = 0
    let legacy = 0
    let missingCanonical = 0
    let zeroLaps = 0
    let incompleteCloudOnly = 0

    for (const session of sessions) {
      const version = Number(session.summary?.best_rules_version || 0)
      if (version >= BEST_RULES_VERSION) canonical += 1
      if (version > 0 && version < BEST_RULES_VERSION) legacy += 1
      if (version <= 0) missingCanonical += 1
      if (Number(session.summary?.laps || 0) <= 0) zeroLaps += 1
      const hasRaw = Number(session.rawChunkCount || 0) > 0 || Number(session.rawSizeBytes || 0) > 0
      if (version < BEST_RULES_VERSION && !hasRaw) incompleteCloudOnly += 1
    }

    if (legacy > 0) {
      issues.push(issue('warning', 'legacy_summary_rules', `${legacy} sessioni hanno best_rules_version vecchia.`))
    }
    if (missingCanonical > 0) {
      issues.push(issue('warning', 'missing_summary_rules', `${missingCanonical} sessioni non dichiarano best_rules_version.`))
    }
    if (incompleteCloudOnly > 0) {
      issues.push(issue('warning', 'cloud_only_incomplete', `${incompleteCloudOnly} sessioni cloud non sono pienamente ricostruibili senza raw/file locali.`))
    }

    return {
      generatedAt: new Date().toISOString(),
      uid,
      sessions: {
        total: sessions.length,
        canonical,
        legacy,
        missingCanonical,
        incompleteCloudOnly,
        zeroLaps
      },
      rawChunks: rawStats,
      projections: {
        statsSchemaVersion: Number(userData?.stats?.schemaVersion || 0),
        sessionIndexSchemaVersion: Number(userData?.sessionIndex?.schemaVersion || 0),
        expectedSessionIndexSchemaVersion: SESSION_INDEX_SCHEMA_VERSION,
        sessionListSchemaVersion,
        expectedSessionListSchemaVersion: SESSION_LIST_PROJECTION_SCHEMA_VERSION,
        sessionListTotalSessions,
        sessionListPageDocs: sessionListPageDocs.length,
        expectedSessionListPageDocs,
        expectedStatsSchemaVersion: USER_STATS_SCHEMA_VERSION,
        trackBestsSchemaVersion: TRACK_BESTS_SCHEMA_VERSION,
        trackDetailProjectionSchemaVersion: TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
        trackBestsDocs: trackBestDocs.length,
        trackDetailProjectionDocs: trackDetailDocs.length,
        missingTrackBests,
        oldTrackBests,
        missingTrackDetailProjections,
        oldTrackDetailProjections
      },
      permissions,
      issues: issues.slice(0, MAX_ISSUES),
      canRebuildProjections: permissions.sessions === 'ok' && permissions.user === 'ok',
      canReprocessFromCloudRaw: rawStats.present > 0
    }
  })
}

export async function verifyOwnerMigrationLightweight(uid: string): Promise<OwnerLightweightVerificationReport> {
  return withFirebaseScenario('maintenance.ownerData.lightweightVerify', { uid }, async () => {
    const userSnap = await getDocTracked(doc(db, `users/${uid}`))
    const userData = userSnap.exists() ? (userSnap.data() || {}) : {}
    const trackBestDocs = await loadCollectionDocs(`users/${uid}/trackBests`)
    const trackDetailDocs = await loadCollectionDocs(`users/${uid}/trackDetailProjections`)
    const sessionListMetaSnap = await getDocTracked(doc(db, `users/${uid}/sessionListMeta/v1`))
    const sessionListMeta = sessionListMetaSnap.exists() ? (sessionListMetaSnap.data() || {}) : {}
    const sessionListPageDocs = await loadCollectionDocs(`users/${uid}/sessionListPages`)

    const statsSchemaVersion = Number(userData?.stats?.schemaVersion || 0)
    const sessionIndexSchemaVersion = Number(userData?.sessionIndex?.schemaVersion || 0)
    const sessionListSchemaVersion = Number(sessionListMeta?.schemaVersion || 0)
    const oldTrackBests = trackBestDocs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      .filter((docSnap: any) => isLegacyTrackBestProjectionDoc(docSnap.data() || {}))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      .map((docSnap: any) => docSnap.id)
    const oldTrackDetailProjections = trackDetailDocs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      .filter((docSnap: any) => Number(docSnap.data()?.schemaVersion || 0) !== TRACK_DETAIL_PROJECTION_SCHEMA_VERSION)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      .map((docSnap: any) => docSnap.id)

    const issues: string[] = []
    if (statsSchemaVersion !== USER_STATS_SCHEMA_VERSION) issues.push('stats_schema_version_mismatch')
    if (sessionIndexSchemaVersion !== SESSION_INDEX_SCHEMA_VERSION) issues.push('session_index_schema_version_mismatch')
    if (sessionListSchemaVersion !== SESSION_LIST_PROJECTION_SCHEMA_VERSION) issues.push('session_list_schema_version_mismatch')
    if (Number(sessionListMeta?.pageCount || 0) !== sessionListPageDocs.length) issues.push('session_list_page_count_mismatch')
    if (Number(sessionListMeta?.totalSessions || 0) !== Number(userData?.stats?.totalSessions || 0)) issues.push('session_list_total_sessions_mismatch')
    if (oldTrackBests.length > 0) issues.push('old_track_bests_schema_or_rules')
    if (oldTrackDetailProjections.length > 0) issues.push('old_track_detail_projection_schema')

    return {
      generatedAt: new Date().toISOString(),
      uid,
      ok: issues.length === 0,
      userSchemas: {
        statsSchemaVersion,
        sessionIndexSchemaVersion,
        sessionListSchemaVersion,
        expectedStatsSchemaVersion: USER_STATS_SCHEMA_VERSION,
        expectedSessionIndexSchemaVersion: SESSION_INDEX_SCHEMA_VERSION,
        expectedSessionListSchemaVersion: SESSION_LIST_PROJECTION_SCHEMA_VERSION
      },
      projections: {
        trackBestsDocs: trackBestDocs.length,
        trackDetailProjectionDocs: trackDetailDocs.length,
        sessionListPageDocs: sessionListPageDocs.length,
        oldTrackBests,
        oldTrackDetailProjections
      },
      issues
    }
  })
}

export async function rebuildOwnerProjections(uid: string): Promise<OwnerProjectionRebuildReport> {
  return withFirebaseScenario('dev.ownerRebuild.projections', { uid }, async () => {
    const sessions = await loadOwnerSessions(uid)
    const trackIds = getTrackIdsFromSessions(sessions)
    const stats = buildUserStatsProjection(sessions)
    const deltas: TrackBestProjectionDelta[] = sessions
      .filter((session) => !!session.sessionId && !!session.meta?.track)
      .map((session) => ({
        trackId: session.meta.track,
        sessionId: session.sessionId,
        dateStart: session.meta.date_start,
        summary: session.summary,
        car: session.meta.car
      }))

    const deletedTrackBests = await deleteCollectionDocs(`users/${uid}/trackBests`)
    const deletedTrackDetailProjections = await deleteCollectionDocs(`users/${uid}/trackDetailProjections`)

    const trackBestsResult = await applyTrackBestsProjectionDeltas({
      db,
      uid,
      deltas,
      getDocFn: getDocTracked,
      setDocFn: setDocTracked,
      bestRulesVersion: BEST_RULES_VERSION
    })

    await writeUserProjectionDocuments({
      db,
      uid,
      sessions,
      setDocFn: setDocTracked
    })

    let wrotePilotDirectory = false
    try {
      const userSnap = await getDocTracked(doc(db, `users/${uid}`))
      const userData = userSnap.exists() ? (userSnap.data() || {}) : {}
      await writePilotDirectoryFromUser({
        db,
        uid,
        userData: {
          uid,
          ...userData,
          sessionsLast7Days: stats.sessionsLast7Days,
          lastSessionDate: stats.lastSessionDate
        },
        setDocFn: setDocTracked
      })
      wrotePilotDirectory = true
    } catch {
      wrotePilotDirectory = false
    }

    return {
      generatedAt: new Date().toISOString(),
      uid,
      sessionCount: sessions.length,
      trackCount: trackIds.length,
      deletedTrackBests,
      deletedTrackDetailProjections,
      updatedTrackBests: trackBestsResult.updatedTracks,
      touchedTrackBests: trackBestsResult.touchedTracks,
      wroteUserProjection: true,
      wrotePilotDirectory
    }
  })
}

export async function rebuildOwnerSessionListProjection(uid: string): Promise<OwnerSessionListProjectionRebuildReport> {
  return withFirebaseScenario('maintenance.ownerData.sessionListProjectionRebuild', { uid }, async () => {
    const sessions = await loadOwnerSessions(uid)
    const projection = await writeSessionListProjectionDocuments({
      db,
      uid,
      sessions,
      setDocFn: setDocTracked
    })

    return {
      generatedAt: new Date().toISOString(),
      uid,
      sessionCount: sessions.length,
      pageCount: projection.meta.pageCount,
      pageSize: projection.meta.pageSize
    }
  })
}

export async function reprocessOwnerCloudRawSummaries(
  uid: string,
  options: OwnerCloudSummaryReprocessOptions = {}
): Promise<OwnerCloudSummaryReprocessReport> {
  const forceAll = options.forceAll === true

  return withFirebaseScenario('dev.ownerRebuild.cloudRawSummaries', { uid, forceAll }, async () => {
    const sessionDocs = await loadCollectionDocs(`users/${uid}/sessions`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    const eligibleDocs = sessionDocs.filter((docSnap: any) => {
      if (forceAll) return true
      const data = docSnap.data() || {}
      const version = Number(data?.summary?.best_rules_version || data?.summaryRulesVersion || 0)
      return version < BEST_RULES_VERSION
    })

    const report: OwnerCloudSummaryReprocessReport = {
      generatedAt: new Date().toISOString(),
      uid,
      forceAll,
      scannedSessions: sessionDocs.length,
      eligibleSessions: eligibleDocs.length,
      processedSessions: 0,
      updatedSessions: 0,
      unchangedSessions: 0,
      skippedNoRaw: 0,
      failedSessions: 0,
      canonicalizedByLocalDomain: 0,
      canonicalizedByCloudRawFallback: 0,
      errors: []
    }

    for (const docSnap of eligibleDocs) {
      try {
        const rawObj = await reconstructRawPayloadFromChunks(uid, docSnap.id, getDocsTracked)
        if (!rawObj) {
          report.skippedNoRaw += 1
          continue
        }

        const canonical = await canonicalizeCloudRawPayload(rawObj)
        if (!canonical?.summary) {
          report.failedSessions += 1
          report.errors.push({ sessionId: docSnap.id, message: 'Canonical summary non generato.' })
          continue
        }

        report.processedSessions += 1
        if (canonical.mode === 'local_domain') {
          report.canonicalizedByLocalDomain += 1
        } else {
          report.canonicalizedByCloudRawFallback += 1
        }

        const existingData = docSnap.data() || {}
        const nextPayload = sanitizeForFirestore({
          meta: canonical.meta || existingData.meta || {},
          summary: canonical.summary,
          summaryRulesVersion: Number(canonical.summary.best_rules_version || BEST_RULES_VERSION)
        })

        const existingComparable = {
          meta: existingData.meta || {},
          summary: existingData.summary || {},
          summaryRulesVersion: Number(existingData.summaryRulesVersion || existingData.summary?.best_rules_version || 0)
        }

        if (stableJson(existingComparable) === stableJson(nextPayload)) {
          report.unchangedSessions += 1
          continue
        }

        await setDocTracked(docSnap.ref, nextPayload, { merge: true })
        report.updatedSessions += 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      } catch (error: any) {
        report.failedSessions += 1
        report.errors.push({
          sessionId: docSnap.id,
          message: error?.message || 'Errore sconosciuto'
        })
      }
    }

    return {
      ...report,
      errors: report.errors.slice(0, MAX_ISSUES)
    }
  })
}
