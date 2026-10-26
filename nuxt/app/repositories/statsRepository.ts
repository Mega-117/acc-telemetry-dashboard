// PIP-619: dati della pagina Statistiche. La lista sessioni arriva dalla proiezione gia' in uso
// (cache in memoria e su disco); il riepilogo e' un solo documento.
import { collection, doc, orderBy, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedGetDocs, trackedRunTransaction } from '~/composables/useFirebaseTracker'
import { loadLightweightSessionSource } from '~/composables/useSessionPager'
import {
  mergeStatsSummary, parseStatsSummary, statsSummaryFingerprint,
  type StatsSessionUpdate, type StatsSummary,
} from '~/services/telemetry/activityStats'
import { refreshStatsSummary, statsSummaryPath, type RefreshStatsSummaryResult } from '~/services/sync/statsSummaryService'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import type { SessionDocument } from '~/types/telemetry'

const CALLER = 'statsRepository'

export async function loadStatsSessions(uid: string): Promise<SessionDocument[] | null> {
  return (await loadLightweightSessionSource(uid))?.sessions ?? null
}

export async function loadStatsSummary(uid: string): Promise<StatsSummary | null> {
  const snap = await trackedGetDoc(doc(db, statsSummaryPath(uid)), CALLER)
  return snap.exists() ? parseStatsSummary(snap.data()) : null
}

/**
 * Unisce gli aggiornamenti all'ULTIMO riepilogo salvato, in una transazione: due PC dello stesso
 * utente non si cancellano il lavoro. Si scrive solo se cambiano i record o il contatore letture.
 */
export async function commitStatsSummary(path: string, updates: StatsSessionUpdate[], cloudReads: number): Promise<StatsSummary> {
  const ref = doc(db, path)
  return trackedRunTransaction(db, CALLER, ref, async (transaction) => {
    const snap = await transaction.get(ref)
    const latest = snap.exists() ? parseStatsSummary(snap.data()) : null
    const next = mergeStatsSummary(latest, updates, new Date().toISOString(), cloudReads)
    if (!latest || cloudReads > 0 || statsSummaryFingerprint(next) !== statsSummaryFingerprint(latest)) {
      transaction.set(ref, sanitizeForFirestore(next))
    }
    return next
  }, { reads: 1, writes: 1 })
}

/**
 * Aggiorna il riepilogo del proprietario (mai per conto di un altro: il coach legge soltanto).
 * `sessions`/`existing` se la pagina li ha gia', altrimenti li legge (lista dalla cache, riepilogo: 1 lettura).
 */
export async function refreshOwnStats(params: {
  uid: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridge Electron, assente nel browser
  electronAPI?: any
  sessions?: SessionDocument[]
  existing?: StatsSummary | null
}): Promise<RefreshStatsSummaryResult | null> {
  const sessions = params.sessions ?? await loadStatsSessions(params.uid)
  if (!sessions) return null
  const existing = params.existing !== undefined ? params.existing : await loadStatsSummary(params.uid)
  return refreshStatsSummary({
    uid: params.uid, sessions, existing, electronAPI: params.electronAPI, commit: commitStatsSummary,
    readCloudSession: (id) => readCloudSessionRaw(params.uid, id),
  })
}

/** La copia compatta online di una sessione del proprietario; `reads` = documenti letti (chunk). */
export async function readCloudSessionRaw(uid: string, sessionId: string): Promise<{ raw: unknown | null, reads: number }> {
  const snap = await trackedGetDocs(query(collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`), orderBy('idx', 'asc')), CALLER)
  const text = snap.docs.map(d => String(d.data()?.chunk || '')).join('')
  const reads = Math.max(1, snap.docs.length)
  if (!text) return { raw: null, reads }
  try { return { raw: JSON.parse(text), reads } } catch { return { raw: null, reads } }
}
