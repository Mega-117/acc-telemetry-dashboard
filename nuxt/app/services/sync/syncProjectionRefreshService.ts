import { rebuildTrackBestsProjection, writeUserProjectionDocuments } from './projectionRebuildService'
import { applyTrackBestsProjectionDeltas, type TrackBestProjectionDelta } from './trackBestsProjectionService'
import { applyUserProjectionDeltas, type UserProjectionDelta } from './syncUserProjectionDeltaService'
import { applyTrackDetailProjectionDeltas } from './trackDetailProjectionService'
import {
  buildNextSyncMirror,
  createSyncMirrorCycle,
  refPath,
  type SyncMirrorCycle,
  type SyncMirrorEntry
} from './syncMirrorService'
import { extractOwnerRevision } from '~/services/cache/ownerRevision'
import type { SessionDocument } from '~/types/telemetry'

export interface ProjectionWrite {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- injected Firestore boundary
  ref: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- projection document
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore set options
  options?: any
}

/** PIP-444: copia fresca di `users/{uid}` letta dal ciclo, l'unica lettura del percorso caldo. */
export interface SyncOwnerDocumentInput {
  exists: boolean
  data: Record<string, unknown> | null
  revision: string | null
}

export interface SyncMirrorInput {
  entry: SyncMirrorEntry | null
  ownerDocument: SyncOwnerDocumentInput | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function deepMergeData(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = output[key]
    output[key] = isPlainObject(current) && isPlainObject(value) ? deepMergeData(current, value) : value
  }
  return output
}

/**
 * PIP-444: due scritture sullo stesso documento nello stesso piano diventano una sola
 * (un documento Firestore = una scrittura). Semantica: un set pieno vince su cio' che lo
 * precede; due `mergeFields` si uniscono (dati e campi); `merge: true` fonde in profondita'.
 */
export function combineProjectionWrites(previous: ProjectionWrite | undefined, next: ProjectionWrite): ProjectionWrite {
  if (!previous) return next
  const previousFields: unknown = previous.options?.mergeFields
  const nextFields: unknown = next.options?.mergeFields
  const nextIsReplace = !next.options || (!Array.isArray(nextFields) && next.options.merge !== true)
  if (nextIsReplace) return next
  const previousIsReplace = !previous.options || (!Array.isArray(previousFields) && previous.options.merge !== true)
  if (Array.isArray(nextFields)) {
    const data = { ...previous.data, ...next.data }
    if (previousIsReplace) return { ref: previous.ref, data }
    if (Array.isArray(previousFields)) {
      return { ref: previous.ref, data, options: { mergeFields: Array.from(new Set([...previousFields, ...nextFields])) } }
    }
    return { ref: previous.ref, data: deepMergeData(previous.data, next.data), options: { merge: true } }
  }
  const data = deepMergeData(previous.data, next.data)
  return previousIsReplace ? { ref: previous.ref, data } : { ref: previous.ref, data, options: { merge: true } }
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
  /**
   * PIP-444: mirror locale dei riepiloghi e copia fresca del documento owner. Con la
   * stessa revisione i documenti presenti nel mirror non vengono riletti; quelli mancanti
   * si leggono uno per uno. Senza mirror il ciclo legge come prima.
   */
  mirror?: SyncMirrorInput
}): Promise<{
  sessions: SessionDocument[]
  projectionsWritten: boolean
  rebuiltTrackBests: boolean
  /** Piano committato (un documento per voce), per chi deve pubblicare il mirror. */
  writes: ProjectionWrite[]
  /** Mirror per il ciclo successivo; `null` se non calcolabile (nessuna revisione). */
  mirror: SyncMirrorEntry | null
  mirrorCycle: Pick<SyncMirrorCycle, 'state' | 'stats'> | null
}> {
  const {
    db,
    uid,
    changedCount,
    loadFullHistory,
    clearTrackDerivedCaches,
    resetAllTrackBests,
    getDocFn: readDoc,
    setDocFn: persistDoc,
    commitWrites,
    bestRulesVersion,
    reason,
    rebuildTrackBests = false,
    trackBestDeltas = [],
    userProjectionDeltas = [],
    mirror
  } = params

  if (changedCount <= 0 && !rebuildTrackBests && trackBestDeltas.length === 0 && userProjectionDeltas.length === 0) {
    return {
      sessions: [],
      projectionsWritten: false,
      rebuiltTrackBests: false,
      writes: [],
      mirror: mirror?.entry ?? null,
      mirrorCycle: null
    }
  }

  clearTrackDerivedCaches()

  // PIP-444: ogni lettura del piano passa dal lettore di ciclo: `users/{uid}` dalla copia
  // fresca, i riepiloghi dal mirror alla stessa revisione, il resto dal cloud (e ricordato).
  const cycle = mirror
    ? createSyncMirrorCycle({ uid, mirror: mirror.entry, ownerDocument: mirror.ownerDocument, getDocFn: readDoc })
    : null
  const getDocFn = cycle ? cycle.getDocFn : readDoc

  // Build the entire plan before publishing: the user index supplies the OLD
  // contribution until every dependent projection can be committed together.
  const writes = new Map<string, ProjectionWrite>()
  const setDocFn: typeof persistDoc = async (ref, data, options) => {
    const key = refPath(ref)
    writes.set(key, combineProjectionWrites(writes.get(key), { ref, data, options }))
  }
  let committedPlan: ProjectionWrite[] = []
  async function commit() {
    const plan = [...writes.values()]
    if (commitWrites) await commitWrites(plan)
    else for (const write of plan) await persistDoc(write.ref, write.data, write.options)
    committedPlan = plan
  }
  function nextMirror(complete: boolean): SyncMirrorEntry | null {
    if (!cycle || !mirror) return null
    const usersWrite = committedPlan.find((write) => refPath(write.ref) === `users/${uid}`)
    return buildNextSyncMirror({
      uid,
      previous: mirror.entry,
      readRevision: mirror.ownerDocument?.revision ?? null,
      writtenRevision: usersWrite ? extractOwnerRevision(usersWrite.data) : null,
      cycleDocs: cycle.cycleDocs,
      writes: committedPlan,
      complete
    })
  }
  const mirrorCycle = cycle ? { state: cycle.state, stats: cycle.stats } : null

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
      strict: true,
      // PIP-441: l'indice piste viaggia nello stesso batch, solo per le piste cambiate.
      indexMode: 'incremental'
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
        rebuiltTrackBests: false,
        writes: committedPlan,
        mirror: nextMirror(false),
        mirrorCycle
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
      // I delta coprono tutto lo storico: l'indice piste viene riscritto completo.
      indexMode: 'full',
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
    rebuiltTrackBests: rebuildTrackBests,
    writes: committedPlan,
    // Il rebuild riscrive ogni documento per intero: il mirror riparte da questi.
    mirror: nextMirror(true),
    mirrorCycle
  }
}
