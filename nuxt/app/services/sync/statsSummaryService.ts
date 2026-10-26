// PIP-619: riepilogo Statistiche in UN documento (`users/{uid}/sessionListMeta/statsV1`),
// aggiornato solo dal proprietario e riscritto solo quando cambia.
//
// Da dove arrivano i giri di una sessione non ancora contata (decisione utente 26/10, opzione A):
// 1. dal file sul PC, se c'e' ancora (gratis); i contributi dei file restano in cache con la firma
//    del file, quindi si rileggono solo i file nuovi o cambiati;
// 2. altrimenti dalla copia compatta online della sessione: una lettura per sessione, una volta
//    sola, con un tetto giornaliero per utente (lo storico si recupera in uno o due giorni).
// Le sessioni contate stanno nel documento stesso: niente si rilegge, nemmeno cambiando PC.
// Le regole di `sessionListMeta` gia' permettono scrittura al proprietario e lettura al coach.
import { isSessionFileCandidate } from '~/repositories/telemetryLocalRepository'
import { generateSessionId } from '~/utils/sessionParser'
import { recordingGame } from '~/services/telemetry/gameIdentity'
import {
  contributionFromSession,
  mergeStatsSummary,
  statsSummaryFingerprint,
  type SessionStatsContribution,
  type StatsSummary,
} from '~/services/telemetry/activityStats'
import type { SessionDocument } from '~/types/telemetry'

export const STATS_SUMMARY_DOC = 'statsV1'
export const statsSummaryPath = (uid: string) => `users/${uid}/sessionListMeta/${STATS_SUMMARY_DOC}`
/** Letture online al giorno per utente, solo per lo storico: ben sotto le 50.000 gratuite del progetto. */
export const STATS_DAILY_CLOUD_READS = 1000
const CACHE_PREFIX = 'racercore.stats.v2.'

interface CachedFile { sig: string, id: string | null, c: SessionStatsContribution | null }
interface StatsCache { files: Record<string, CachedFile>, day: string, cloudReads: number }

export interface StatsSummaryStorage { get(key: string): string | null, set(key: string, value: string): void }

export const browserStatsStorage: StatsSummaryStorage = {
  get(key) { try { return globalThis.localStorage?.getItem(key) ?? null } catch { return null } },
  set(key, value) { try { globalThis.localStorage?.setItem(key, value) } catch { /* cache only */ } },
}

function readCache(storage: StatsSummaryStorage, uid: string): StatsCache {
  try {
    const parsed = JSON.parse(storage.get(CACHE_PREFIX + uid) || 'null')
    if (parsed && typeof parsed.files === 'object') return { files: parsed.files, day: String(parsed.day || ''), cloudReads: Number(parsed.cloudReads) || 0 }
  } catch { /* cache rotta: si ricalcola */ }
  return { files: {}, day: '', cloudReads: 0 }
}

export interface RefreshStatsSummaryParams {
  uid: string
  /** Lista sessioni del proprietario (proiezione gia' caricata). */
  sessions: SessionDocument[]
  /** Riepilogo attuale (gia' letto dalla pagina) oppure null. */
  existing: StatsSummary | null
  /** Copia compatta online di una sessione (una lettura) oppure null. */
  readCloudSession: (sessionId: string) => Promise<unknown | null>
  write: (path: string, summary: StatsSummary) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridge Electron (getTelemetryFiles, readFile), assente nel browser
  electronAPI?: any
  storage?: StatsSummaryStorage
  now?: () => Date
  dailyCloudReads?: number
}

export interface RefreshStatsSummaryResult {
  written: boolean
  summary: StatsSummary | null
  filesRead: number
  cloudReads: number
  /** Sessioni ancora da contare (tetto giornaliero raggiunto). */
  remaining: number
}

let inFlight: Promise<RefreshStatsSummaryResult> | null = null

/** Una sola esecuzione alla volta: chi chiama durante un calcolo riceve lo stesso risultato. */
export function refreshStatsSummary(params: RefreshStatsSummaryParams): Promise<RefreshStatsSummaryResult> {
  if (!inFlight) inFlight = runRefresh(params).finally(() => { inFlight = null })
  return inFlight
}

async function localContributions(uid: string, electronAPI: RefreshStatsSummaryParams['electronAPI'], cache: StatsCache) {
  const byId = new Map<string, SessionStatsContribution | null>()
  const files: Record<string, CachedFile> = {}
  let filesRead = 0
  if (typeof electronAPI?.getTelemetryFiles !== 'function' || typeof electronAPI?.readFile !== 'function') return { byId, files, filesRead }
  const list = await electronAPI.getTelemetryFiles()
  for (const file of Array.isArray(list) ? list : []) {
    const name = String(file?.name || '')
    if (!name.toLowerCase().endsWith('.json') || name.toLowerCase() === 'live_state.json') continue
    const sig = `${Number(file?.size) || 0}:${Number(file?.mtime) || 0}`
    let entry = cache.files[name]
    if (!entry || entry.sig !== sig) {
      entry = { sig, id: null, c: null }
      try {
        const raw = await electronAPI.readFile(name)
        // Solo ACC: per ACC l'id della sessione e' data+pista, come nella lista (generateSessionId).
        if (raw && isSessionFileCandidate(name, raw) && raw.ownerId === uid && recordingGame(raw) === 'acc') {
          entry = { sig, id: generateSessionId(String(raw.session_info.date_start), String(raw.session_info.track), 'acc'), c: contributionFromSession(raw) }
        }
      } catch { /* file illeggibile: resta senza contributo */ }
      filesRead += 1
      if (filesRead % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
    files[name] = entry
    if (entry.id) byId.set(entry.id, entry.c)
  }
  return { byId, files, filesRead }
}

async function runRefresh(params: RefreshStatsSummaryParams): Promise<RefreshStatsSummaryResult> {
  const { uid, sessions, existing, readCloudSession, write, electronAPI, storage = browserStatsStorage, now = () => new Date(), dailyCloudReads = STATS_DAILY_CLOUD_READS } = params
  if (!uid) return { written: false, summary: existing, filesRead: 0, cloudReads: 0, remaining: 0 }
  const cache = readCache(storage, uid)
  const today = now().toISOString().slice(0, 10)
  let readsToday = cache.day === today ? cache.cloudReads : 0
  const counted = new Set(existing?.counted ?? [])
  // Solo sessioni ACC con giri validi: le altre non hanno niente da contare.
  const pending = sessions
    .filter(s => (s.meta?.gameId ?? 'acc') === 'acc' && Number(s.summary?.lapsValid) > 0 && !counted.has(s.sessionId))
    .map(s => s.sessionId)
  const local = await localContributions(uid, electronAPI, cache)
  const contributions: SessionStatsContribution[] = []
  const done: string[] = []
  const fromCloud: string[] = []
  for (const id of pending) {
    if (local.byId.has(id)) {
      const c = local.byId.get(id)
      if (c) contributions.push(c)
      done.push(id)
    } else if (readsToday + fromCloud.length < dailyCloudReads) fromCloud.push(id)
  }
  readsToday += fromCloud.length
  const cloudReads = fromCloud.length
  // Otto letture alla volta: lo storico arriva in pochi secondi senza raffiche.
  for (let i = 0; i < fromCloud.length; i += 8) {
    const batch = fromCloud.slice(i, i + 8)
    const raws = await Promise.all(batch.map(id => readCloudSession(id).catch(() => undefined)))
    raws.forEach((raw, k) => {
      if (raw === undefined) return // errore di rete: si riprova la prossima volta
      const c = raw ? contributionFromSession(raw) : null
      if (c) contributions.push(c)
      done.push(batch[k]!)
    })
  }
  const persist = () => storage.set(CACHE_PREFIX + uid, JSON.stringify({ files: { ...cache.files, ...local.files }, day: today, cloudReads: readsToday }))
  const remaining = pending.length - done.length
  if (!done.length) {
    persist()
    return { written: false, summary: existing, filesRead: local.filesRead, cloudReads, remaining }
  }
  // Il contatore delle letture si salva prima della scrittura: anche se questa fallisce, il tetto tiene.
  persist()
  const summary = mergeStatsSummary(existing, contributions, done, now().toISOString())
  let written = false
  if (!existing || statsSummaryFingerprint(summary) !== statsSummaryFingerprint(existing)) {
    await write(statsSummaryPath(uid), summary)
    written = true
  }
  return { written, summary, filesRead: local.filesRead, cloudReads, remaining }
}
