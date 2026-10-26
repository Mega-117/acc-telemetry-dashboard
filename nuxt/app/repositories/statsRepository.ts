// PIP-619: dati della pagina Statistiche. La lista sessioni arriva dalla proiezione gia' in uso
// (cache in memoria e su disco); il riepilogo e' un solo documento.
import { collection, doc, orderBy, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedGetDocs, trackedSetDoc } from '~/composables/useFirebaseTracker'
import { loadLightweightSessionSource } from '~/composables/useSessionPager'
import { parseStatsSummary, type StatsSummary } from '~/services/telemetry/activityStats'
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

export async function writeStatsSummary(path: string, summary: StatsSummary): Promise<void> {
  await trackedSetDoc(doc(db, path), sanitizeForFirestore(summary), CALLER)
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
    uid: params.uid, sessions, existing, electronAPI: params.electronAPI, write: writeStatsSummary,
    readCloudSession: (id) => readCloudSessionRaw(params.uid, id),
  })
}

/** La copia compatta online di una sessione del proprietario: una lettura (un chunk). */
export async function readCloudSessionRaw(uid: string, sessionId: string): Promise<unknown | null> {
  const snap = await trackedGetDocs(query(collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`), orderBy('idx', 'asc')), CALLER)
  const text = snap.docs.map(d => String(d.data()?.chunk || '')).join('')
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}
