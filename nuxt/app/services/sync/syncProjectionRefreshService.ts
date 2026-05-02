import { rebuildTrackBestsProjection, writeUserProjectionDocuments } from './projectionRebuildService'
import { applyTrackBestsProjectionDeltas, type TrackBestProjectionDelta } from './trackBestsProjectionService'
import { applyUserProjectionDeltas, type UserProjectionDelta } from './syncUserProjectionDeltaService'
import type { SessionDocument } from '~/composables/useTelemetryData'

export async function refreshSyncProjections(params: {
  db: any
  uid: string
  changedCount: number
  loadSessions: (targetUserId?: string, forceRefresh?: boolean, options?: any) => Promise<SessionDocument[] | null>
  clearTrackDerivedCaches: () => void
  resetAllTrackBests: (uid: string) => Promise<number>
  getDocFn: (ref: any) => Promise<any>
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  bestRulesVersion: number
  reason: string
  rebuildTrackBests?: boolean
  trackBestDeltas?: TrackBestProjectionDelta[]
  userProjectionDeltas?: UserProjectionDelta[]
}): Promise<{ sessions: SessionDocument[]; projectionsWritten: boolean; rebuiltTrackBests: boolean }> {
  const {
    db,
    uid,
    changedCount,
    loadSessions,
    clearTrackDerivedCaches,
    resetAllTrackBests,
    getDocFn,
    setDocFn,
    bestRulesVersion,
    reason,
    rebuildTrackBests = false,
    trackBestDeltas = [],
    userProjectionDeltas = []
  } = params

  if (changedCount <= 0 && !rebuildTrackBests && trackBestDeltas.length === 0 && userProjectionDeltas.length === 0) {
    return {
      sessions: [],
      projectionsWritten: false,
      rebuiltTrackBests: false
    }
  }

  clearTrackDerivedCaches()

  if (!rebuildTrackBests && trackBestDeltas.length > 0) {
    await applyTrackBestsProjectionDeltas({
      db,
      uid,
      deltas: trackBestDeltas,
      getDocFn,
      setDocFn,
      bestRulesVersion
    })
  }

  if (!rebuildTrackBests && userProjectionDeltas.length > 0) {
    await applyUserProjectionDeltas({
      db,
      uid,
      deltas: userProjectionDeltas,
      getDocFn,
      setDocFn
    })

    return {
      sessions: [],
      projectionsWritten: true,
      rebuiltTrackBests: false
    }
  }

  const freshSessions = await loadSessions(undefined, true, {
    sourceMode: 'cloud_fresh',
    context: reason
  }) || []

  if (rebuildTrackBests) {
    await rebuildTrackBestsProjection({
      db,
      uid,
      sessions: freshSessions,
      resetAllTrackBests,
      getDocFn,
      setDocFn,
      bestRulesVersion
    })
    clearTrackDerivedCaches()
  }

  await writeUserProjectionDocuments({
    db,
    uid,
    sessions: freshSessions,
    setDocFn
  })

  return {
    sessions: freshSessions,
    projectionsWritten: true,
    rebuiltTrackBests: rebuildTrackBests
  }
}
