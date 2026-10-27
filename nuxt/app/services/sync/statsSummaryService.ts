// PIP-619: riepilogo Statistiche in UN documento (`users/{uid}/sessionListMeta/statsV1`),
// aggiornato solo dal proprietario.
//
// Da dove arrivano i giri di una sessione da contare (decisione utente 26/10, opzione A):
// 1. dal file sul PC, se c'e' ancora (gratis); i contributi dei file restano in cache con la firma
//    del file, quindi si rileggono solo i file nuovi o cambiati;
// 2. altrimenti dalla copia compatta online della sessione, una volta sola, con un tetto di letture
//    al giorno per utente contato sulle letture vere e condiviso fra i PC (nel documento stesso).
// Una sessione si riconta se nella lista cambiano i suoi giri validi. La scrittura e' una
// transazione: due PC dello stesso utente non si cancellano il lavoro a vicenda.
// Le regole di `sessionListMeta` gia' permettono scrittura al proprietario e lettura al coach.
import { isSessionFileCandidate } from '~/repositories/telemetryLocalRepository'
import { generateSessionId } from '~/utils/sessionParser'
import { recordingGame } from '~/services/telemetry/gameIdentity'
import {
  contributionFromSession,
  StatsSummaryTooLargeError,
  type SessionStatsContribution,
  type StatsSessionUpdate,
  type StatsSummary,
} from '~/services/telemetry/activityStats'
import type { SessionDocument } from '~/types/telemetry'

export const STATS_SUMMARY_DOC = 'statsV1'
export const statsSummaryPath = (uid: string) => `users/${uid}/sessionListMeta/${STATS_SUMMARY_DOC}`
/**
 * Letture online al giorno per utente, solo per lo storico. PIP-660: 200 (era 1000): con 40-60 piloti, 1000 a
 * testa arrivavano al limite gratuito di 50.000 letture al giorno del progetto. Lo storico si completa in
 * qualche giorno; nel programma desktop arriva dai file sul PC, senza letture.
 */
export const STATS_DAILY_CLOUD_READS = 200
const CACHE_PREFIX = 'racercore.stats.v3.'

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
  /** Copia compatta online di una sessione e quante letture e' costata. */
  readCloudSession: (sessionId: string) => Promise<{ raw: unknown | null, reads: number }>
  /** Unisce gli aggiornamenti all'ultimo riepilogo salvato (transazione) e restituisce quello scritto. */
  commit: (path: string, updates: StatsSessionUpdate[], cloudReads: number) => Promise<StatsSummary>
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
  reason?: 'too-large'
}

const inFlight = new Map<string, Promise<RefreshStatsSummaryResult>>()

/** Una sola esecuzione per utente: chi chiama durante un calcolo dello stesso utente riceve lo stesso risultato. */
export function refreshStatsSummary(params: RefreshStatsSummaryParams): Promise<RefreshStatsSummaryResult> {
  let running = inFlight.get(params.uid)
  if (!running) {
    running = runRefresh(params).finally(() => { inFlight.delete(params.uid) })
    inFlight.set(params.uid, running)
  }
  return running
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
  const { uid, sessions, existing, readCloudSession, commit, electronAPI, storage = browserStatsStorage, now = () => new Date(), dailyCloudReads = STATS_DAILY_CLOUD_READS } = params
  const empty = { written: false, summary: existing, filesRead: 0, cloudReads: 0, remaining: 0 }
  if (!uid) return empty
  const cache = readCache(storage, uid)
  const today = now().toISOString().slice(0, 10)
  // Il tetto vale per l'utente (contatore nel documento, condiviso fra PC) e per questo PC.
  const usedToday = Math.max(cache.day === today ? cache.cloudReads : 0, existing?.cloudReads.day === today ? existing.cloudReads.count : 0)
  let budget = Math.max(0, dailyCloudReads - usedToday)
  const counted = existing?.counted ?? {}
  // Solo sessioni ACC con giri validi, nuove o con giri validi cambiati.
  const pending = sessions
    .filter(s => (s.meta?.gameId ?? 'acc') === 'acc' && Number(s.summary?.lapsValid) > 0 && counted[s.sessionId] !== Number(s.summary?.lapsValid))
    .map(s => ({ id: s.sessionId, lapsValid: Number(s.summary?.lapsValid) }))
  const local = await localContributions(uid, electronAPI, cache)
  const updates: StatsSessionUpdate[] = []
  const fromCloud: typeof pending = []
  for (const p of pending) {
    if (local.byId.has(p.id)) updates.push({ sessionId: p.id, lapsValid: p.lapsValid, contribution: local.byId.get(p.id) ?? null })
    else fromCloud.push(p)
  }
  let cloudReads = 0
  let remaining = 0
  // Otto letture alla volta: lo storico arriva in pochi secondi senza raffiche.
  for (let i = 0; i < fromCloud.length; i += 8) {
    if (budget <= 0) { remaining = fromCloud.length - i; break }
    const batch = fromCloud.slice(i, i + Math.min(8, budget))
    const results = await Promise.all(batch.map(p => readCloudSession(p.id).catch(() => undefined)))
    results.forEach((result, k) => {
      if (!result) return // errore di rete: si riprova la prossima volta
      cloudReads += Math.max(1, result.reads)
      budget -= Math.max(1, result.reads)
      updates.push({ sessionId: batch[k]!.id, lapsValid: batch[k]!.lapsValid, contribution: result.raw ? contributionFromSession(result.raw) : null })
    })
    if (batch.length < Math.min(8, fromCloud.length - i)) { remaining = fromCloud.length - i - batch.length; break }
  }
  // Il contatore delle letture si salva prima della scrittura: anche se questa fallisce, il tetto tiene.
  storage.set(CACHE_PREFIX + uid, JSON.stringify({ files: { ...cache.files, ...local.files }, day: today, cloudReads: usedToday + cloudReads }))
  if (!updates.length) return { ...empty, filesRead: local.filesRead, remaining }
  try {
    const summary = await commit(statsSummaryPath(uid), updates, cloudReads)
    return { written: true, summary, filesRead: local.filesRead, cloudReads, remaining }
  } catch (error) {
    if (error instanceof StatsSummaryTooLargeError) return { ...empty, filesRead: local.filesRead, cloudReads, remaining, reason: 'too-large' }
    throw error
  }
}
