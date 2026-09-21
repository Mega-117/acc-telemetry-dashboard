import { rebuildTrackBestsProjection, writeUserProjectionDocuments } from './projectionRebuildService'
import { applyTrackBestsProjectionDeltas, type TrackBestProjectionDelta } from './trackBestsProjectionService'
import { applyUserProjectionDeltas, type UserProjectionDelta } from './syncUserProjectionDeltaService'
import { applyTrackDetailProjectionDeltas } from './trackDetailProjectionService'
import type { SessionDocument } from '~/types/telemetry'

export interface ProjectionWrite {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- injected Firestore boundary
  ref: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- projection document
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore set options
  options?: any
}

export async function refreshSyncProjections(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  changedCount: number
  /**
   * PIP-436: storico completo dell'owner per il raro ricalcolo totale. Mai il caricatore
   * limitato della UI: ricalcolare su un sottoinsieme sovrascrive statistiche e
   * proiezioni come se le sessioni piu' vecchie non esistessero.
   */
  loadFullHistory: (uid: string) => Promise<SessionDocument[]>
  clearTrackDerivedCaches: () => void
  resetAllTrackBests: (uid: string) => Promise<number>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  commitWrites?: (writes: ProjectionWrite[]) => Promise<void>
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
    loadFullHistory,
    clearTrackDerivedCaches,
    resetAllTrackBests,
    getDocFn,
    setDocFn: persistDoc,
    commitWrites,
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

  // Build the entire plan before publishing: the user index supplies the OLD
  // contribution until every dependent projection can be committed together.
  const writes = new Map<string, ProjectionWrite>()
  const setDocFn: typeof persistDoc = async (ref, data, options) => {
    writes.set(String(ref.path ?? ref), { ref, data, options })
  }
  async function commit() {
    const plan = [...writes.values()]
    if (commitWrites) await commitWrites(plan)
    else for (const write of plan) await persistDoc(write.ref, write.data, write.options)
  }

  // Il riepilogo utente va per primo: la sua lettura fornisce il contributo gia' contato
  // delle sessioni aggiornate, riusato da best e dettaglio pista senza altre letture.
  let previousContributions = new Map()
  if (!rebuildTrackBests && userProjectionDeltas.length > 0) {
    const userResult = await applyUserProjectionDeltas({
      db,
      uid,
      deltas: userProjectionDeltas,
      getDocFn,
      setDocFn
    })
    previousContributions = userResult.previousContributions
  }

  const missingPrevious = userProjectionDeltas.some(delta => delta.status === 'updated' && !previousContributions.has(delta.sessionId))

  if (!rebuildTrackBests && !missingPrevious && trackBestDeltas.length > 0) {
    await applyTrackBestsProjectionDeltas({
      db,
      uid,
      deltas: trackBestDeltas,
      getDocFn,
      setDocFn,
      bestRulesVersion,
      previousContributions,
      strict: true
    })
  }

  if (!rebuildTrackBests && !missingPrevious && userProjectionDeltas.length > 0) {
    const trackDetailResult = await applyTrackDetailProjectionDeltas({
      db,
      uid,
      deltas: userProjectionDeltas,
      getDocFn,
      setDocFn,
      previousContributions
    })

    if (!trackDetailResult.requiresFullRebuild) {
      await commit()
      return {
        sessions: [],
        projectionsWritten: true,
        rebuiltTrackBests: false
      }
    }
    console.warn(`[SYNC] ${reason}: track detail not safely incremental, rebuilding from full history`)
  }

  const freshSessions = await loadFullHistory(uid)
  // Discard the incremental plan: the full rebuild writes each document once.
  writes.clear()

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
  } else {
    // A fallback must repair activity/bests too, not only users and track detail.
    // Rebuild from authoritative sessions without deleting cloud documents first.
    await applyTrackBestsProjectionDeltas({
      db, uid, bestRulesVersion, setDocFn, strict: true,
      getDocFn: async () => ({ exists: () => false }),
      deltas: freshSessions.filter(session => session.meta?.track && session.sessionId).map(session => ({
        trackId: session.meta.track, sessionId: session.sessionId,
        dateStart: session.meta.date_start, car: session.meta.car, summary: session.summary
      }))
    })
  }

  await writeUserProjectionDocuments({
    db,
    uid,
    sessions: freshSessions,
    setDocFn
  })
  await commit()

  return {
    sessions: freshSessions,
    projectionsWritten: true,
    rebuiltTrackBests: rebuildTrackBests
  }
}
