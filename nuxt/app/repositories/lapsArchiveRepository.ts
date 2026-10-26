// PIP-623: dati del pannello admin "Archivio giri" dal riepilogo del Worker, in forma pronta da
// mostrare. Le stime sono dichiarate come tali: con la scadenza a 30 giorni lo spazio dei giri non
// cresce all'infinito, si ferma a circa "30 giorni di giri".
import { loadLapsSummary, setLapsSwitch, type LapsArchiveDeps } from '~/services/telemetry/lapsArchiveClient'

// Stessi tetti del Worker (workers/diagnostics-ingest/src/lapsQuota.mjs): meta' del piano gratuito R2.
export const LAPS_CAPS = Object.freeze({ storageBytes: 5 * 1024 ** 3, classA: 500_000, classB: 5_000_000 })
export const LAPS_DISABLE_RATIO = 0.6
// Stime per la previsione: peso medio di un giro (misurato: 32–63 KB) e operazioni di classe A per invio.
const AVG_LAP_BYTES = 64 * 1024
const CLASS_A_PER_UPLOAD = 3

export interface LapsSummary {
  decision: { enabled: boolean, reason: string }
  state: { checkedAt?: string, dataThrough?: string, storageBytes?: number, classAMonth?: number, classBMonth?: number, reason?: string, error?: string } | null
  override: { mode?: string, at?: string } | null
  lastSync: { at?: string, downloaded?: number, total?: number, complete?: boolean } | null
  days: Record<string, Record<string, { uploads: number, shares: number }>>
  countersTruncated?: boolean
  rejections: { day: string, reason: string, uid: string }[]
  rejectionsTruncated?: boolean
}

export interface LapsArchiveModel {
  enabled: boolean
  reason: string
  usage: { key: 'storage' | 'classA' | 'classB', label: string, value: number, cap: number, percent: number | null }[]
  checkedAt: string | null
  lastSync: LapsSummary['lastSync']
  days: { day: string, uploads: number, shares: number }[]
  pilots: { uid: string, uploads: number, shares: number }[]
  rejections: { reason: string, count: number }[]
  forecast: { uploadsPerDay: number, storagePercent: number, classAPercent: number } | null
  truncated: boolean
  rejectionsTruncated: boolean
}

const REASONS: Record<string, string> = {
  ok: 'Attivo', 'usage-unknown': 'Consumi non leggibili', stale: 'Controllo dei consumi troppo vecchio', 'storage-60': 'Spazio oltre soglia',
  'class-a-60': 'Scritture oltre soglia', 'class-b-60': 'Letture oltre soglia', 'admin-off': 'Spento dall’admin', 'env-off': 'Spento dal Worker',
}
export function reasonLabel(reason: string): string { return REASONS[reason] ?? reason }

function lastDays(nowMs: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => new Date(nowMs - (count - 1 - i) * 86400000).toISOString().slice(0, 10))
}

export function lapsArchiveModel(summary: LapsSummary, nowMs: number): LapsArchiveModel {
  const state = summary.state ?? null
  const percent = (value: number | undefined, cap: number) => typeof value === 'number' && Number.isFinite(value) ? Math.round((value / (cap * 2)) * 1000) / 10 : null
  const days = lastDays(nowMs, 30).map((day) => {
    const byUid = summary.days?.[day] ?? {}
    return { day, uploads: Object.values(byUid).reduce((s, v) => s + v.uploads, 0), shares: Object.values(byUid).reduce((s, v) => s + v.shares, 0) }
  })
  const pilots = new Map<string, { uploads: number, shares: number }>()
  for (const byUid of Object.values(summary.days ?? {})) {
    for (const [uid, value] of Object.entries(byUid)) {
      const current = pilots.get(uid) ?? { uploads: 0, shares: 0 }
      pilots.set(uid, { uploads: current.uploads + value.uploads, shares: current.shares + value.shares })
    }
  }
  const rejections = new Map<string, number>()
  for (const item of summary.rejections ?? []) rejections.set(item.reason, (rejections.get(item.reason) ?? 0) + 1)
  const recent = days.slice(-14)
  const uploadsPerDay = recent.reduce((s, d) => s + d.uploads, 0) / recent.length
  return {
    enabled: summary.decision?.enabled === true,
    reason: summary.decision?.reason ?? 'usage-unknown',
    // Percentuali sul piano GRATUITO (10 GB, 1M, 10M): il tetto dei giri e' la meta'.
    usage: [
      { key: 'storage', label: 'Spazio', value: state?.storageBytes ?? 0, cap: LAPS_CAPS.storageBytes, percent: percent(state?.storageBytes, LAPS_CAPS.storageBytes) },
      { key: 'classA', label: 'Scritture (classe A)', value: state?.classAMonth ?? 0, cap: LAPS_CAPS.classA, percent: percent(state?.classAMonth, LAPS_CAPS.classA) },
      { key: 'classB', label: 'Letture (classe B)', value: state?.classBMonth ?? 0, cap: LAPS_CAPS.classB, percent: percent(state?.classBMonth, LAPS_CAPS.classB) },
    ],
    checkedAt: state?.checkedAt ?? null,
    lastSync: summary.lastSync ?? null,
    days,
    pilots: [...pilots.entries()].map(([uid, v]) => ({ uid, ...v })).sort((a, b) => b.uploads - a.uploads),
    rejections: [...rejections.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    // Al ritmo delle ultime 2 settimane: spazio a regime (giri tenuti 30 giorni) e scritture del mese, solo giri.
    forecast: uploadsPerDay > 0 ? {
      uploadsPerDay: Math.round(uploadsPerDay * 10) / 10,
      storagePercent: Math.round((uploadsPerDay * 30 * AVG_LAP_BYTES) / (LAPS_CAPS.storageBytes * 2) * 1000) / 10,
      classAPercent: Math.round((uploadsPerDay * 30 * CLASS_A_PER_UPLOAD) / (LAPS_CAPS.classA * 2) * 1000) / 10,
    } : null,
    truncated: summary.countersTruncated === true,
    rejectionsTruncated: summary.rejectionsTruncated === true,
  }
}

export async function loadLapsArchive(deps: LapsArchiveDeps, nowMs = Date.now()): Promise<LapsArchiveModel> {
  return lapsArchiveModel(await loadLapsSummary(deps) as LapsSummary, nowMs)
}

export async function switchLapsArchive(mode: 'auto' | 'off', deps: LapsArchiveDeps): Promise<void> {
  await setLapsSwitch(mode, deps)
}
