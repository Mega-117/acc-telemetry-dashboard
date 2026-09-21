import { rebuildTrackBestsProjection, writeUserProjectionDocuments } from './projectionRebuildService'
import { applyTrackBestsProjectionDeltas, type TrackBestProjectionDelta } from './trackBestsProjectionService'
import { applyUserProjectionDeltas, type UserProjectionDelta } from './syncUserProjectionDeltaService'
import { applyTrackDetailProjectionDeltas } from './trackDetailProjectionService'
import type { SessionDocument } from '~/types/telemetry'

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

  if (!rebuildTrackBests && trackBestDeltas.length > 0) {
    await applyTrackBestsProjectionDeltas({
      db,
      uid,
      deltas: trackBestDeltas,
      getDocFn,
      setDocFn,
      bestRulesVersion,
      previousContributions
    })
  }

  if (!rebuildTrackBests && userProjectionDeltas.length > 0) {
    const trackDetailResult = await applyTrackDetailProjectionDeltas({
      db,
      uid,
      deltas: userProjectionDeltas,
      getDocFn,
      setDocFn,
      previousContributions
    })

    if (!trackDetailResult.requiresFullRebuild) {
      return {
        sessions: [],
        projectionsWritten: true,
        rebuiltTrackBests: false
      }
    }
    console.warn(`[SYNC] ${reason}: track detail not safely incremental, rebuilding from full history`)
  }

  const freshSessions = await loadFullHistory(uid)

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
