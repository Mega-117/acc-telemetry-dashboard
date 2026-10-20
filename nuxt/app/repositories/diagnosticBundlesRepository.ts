// PIP-540: elenco e scarico dei pacchetti diagnostici su R2, tramite il Worker (PIP-539).
// Nessuna lettura o scrittura Firestore: il Worker accetta solo l'ID token di un admin.
// PIP-567: gli "ultimi giorni" si leggono per data (`?day=`, un elenco per giorno) invece di
// scorrere tutto `diag/` in ordine alfabetico; un Worker precedente risponde 400 e si torna al
// vecchio scorrimento. Versione e canale dell'app arrivano dai metadati, senza scaricare.

export const DIAGNOSTICS_INGEST_ORIGIN = 'https://racercore-diagnostics-ingest.enricosaian.workers.dev'
export const DIAGNOSTIC_BUNDLES_PAGE_SIZE = 100

const KEY = /^diag\/([A-Za-z0-9-]{8,64})\/(\d{4}-\d{2}-\d{2})\/(([a-z][a-z-]{1,15})-\d{8}T\d{6}-[0-9a-f]{8})\.jsonl\.gz$/
const DAY_MS = 24 * 60 * 60 * 1000

export interface DiagnosticBundleItem {
  key: string
  installationId: string
  date: string
  kind: string
  bundleId: string
  size: number
  uploadedAt: string
  uploaderUid: string | null
  // PIP-547: dichiarati dall'app; assenti nei pacchetti delle versioni precedenti.
  trigger: string | null
  os: string | null
  // PIP-567: versione e canale dell'app che ha inviato il pacchetto.
  version: string | null
  channel: string | null
}

export interface DiagnosticBundlePage {
  items: DiagnosticBundleItem[]
  cursor: string | null
}

type Deps = { getToken: () => Promise<string | null>, fetchImpl?: typeof fetch, origin?: string }
type ListedObject = {
  key: string, size: number, uploaded: string, uid?: string | null, trigger?: string | null, os?: string | null,
  version?: string | null, channel?: string | null
}

export class DiagnosticBundlesError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'DiagnosticBundlesError'
    this.status = status
  }
}

export function parseBundleKey(key: string): Pick<DiagnosticBundleItem, 'installationId' | 'date' | 'kind' | 'bundleId'> | null {
  const match = KEY.exec(key)
  return match ? { installationId: match[1]!, date: match[2]!, bundleId: match[3]!, kind: match[4]! } : null
}

export function buildBundlePrefix(installationId?: string, date?: string): string {
  const installation = (installationId || '').trim()
  if (!installation) return 'diag/'
  const day = (date || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `diag/${installation}/${day}/` : `diag/${installation}/`
}

/** Origine del Worker: quella configurata a runtime (Worker locale durante i collaudi) oppure la produzione. */
export function resolveDiagnosticsOrigin(configured?: unknown): string {
  const value = typeof configured === 'string' ? configured.trim().replace(/\/+$/, '') : ''
  return /^https:\/\/[^/\s]+$/.test(value) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(value) ? value : DIAGNOSTICS_INGEST_ORIGIN
}

async function authorizedFetch(path: string, { getToken, fetchImpl = fetch, origin = DIAGNOSTICS_INGEST_ORIGIN }: Deps) {
  const token = await getToken()
  if (!token) throw new DiagnosticBundlesError('Sessione non disponibile: accedi di nuovo.', 0)
  const response = await fetchImpl(`${origin}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new DiagnosticBundlesError('Sessione scaduta: accedi di nuovo.', 401)
  if (response.status === 403) throw new DiagnosticBundlesError('Questo account non è autorizzato a leggere i pacchetti.', 403)
  if (!response.ok) throw new DiagnosticBundlesError(`Il servizio pacchetti non risponde (${response.status}).`, response.status)
  return response
}

function toItems(objects: ListedObject[] | undefined): DiagnosticBundleItem[] {
  const items = (objects || []).flatMap((object) => {
    const parsed = parseBundleKey(object.key)
    return parsed ? [{
      key: object.key, ...parsed, size: object.size, uploadedAt: object.uploaded, uploaderUid: object.uid ?? null,
      trigger: object.trigger ?? null, os: object.os ?? null, version: object.version ?? null, channel: object.channel ?? null,
    }] : []
  })
  items.sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
  return items
}

export async function listDiagnosticBundles(
  deps: Deps,
  options: { installationId?: string, date?: string, cursor?: string | null, limit?: number } = {}
): Promise<DiagnosticBundlePage> {
  const params = new URLSearchParams({
    prefix: buildBundlePrefix(options.installationId, options.date),
    limit: String(options.limit ?? DIAGNOSTIC_BUNDLES_PAGE_SIZE)
  })
  if (options.cursor) params.set('cursor', options.cursor)
  const response = await authorizedFetch(`/v1/admin/list?${params}`, deps)
  const body = await response.json() as { objects?: ListedObject[], cursor?: string | null }
  return { items: toItems(body.objects), cursor: body.cursor ?? null }
}

/** Tutti i pacchetti di un giorno (data del pacchetto), scorrendo le pagine del Worker. */
export async function listDiagnosticBundlesOfDay(
  deps: Deps, day: string, { maxPages = 10 }: { maxPages?: number } = {}
): Promise<{ items: DiagnosticBundleItem[], complete: boolean }> {
  const items: DiagnosticBundleItem[] = []
  let cursor: string | null = null
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ day, limit: '500' })
    if (cursor) params.set('cursor', cursor)
    const response = await authorizedFetch(`/v1/admin/list?${params}`, deps)
    const body = await response.json() as { objects?: ListedObject[], cursor?: string | null }
    items.push(...toItems(body.objects))
    cursor = body.cursor ?? null
    if (!cursor) return { items, complete: true }
  }
  return { items, complete: false }
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Pacchetti degli ultimi `days` giorni (per data del pacchetto): un elenco per giorno tramite
 * i segnaposto `by-day/` del Worker, dal piu' recente (anche "domani", per orologi avanti o
 * fusi oltre l'UTC). Se il Worker in linea non li conosce ancora (400) si scorre `diag/` come
 * prima: al massimo `maxPages` pagine, dicendo se l'elenco e' incompleto.
 */
export async function listRecentDiagnosticBundles(
  deps: Deps,
  { days = 7, nowMs = Date.now(), maxPages = 4 }: { days?: number, nowMs?: number, maxPages?: number } = {}
): Promise<{ items: DiagnosticBundleItem[], complete: boolean }> {
  const fromDay = dayOf(nowMs - days * DAY_MS)
  let items: DiagnosticBundleItem[] = []
  let complete = true
  try {
    for (let offset = -1; offset <= days; offset += 1) {
      const day = await listDiagnosticBundlesOfDay(deps, dayOf(nowMs - offset * DAY_MS))
      items.push(...day.items)
      complete = complete && day.complete
    }
  } catch (error) {
    if (!(error instanceof DiagnosticBundlesError) || error.status !== 400) throw error
    items = []
    let cursor: string | null = null
    for (let page = 0; page < maxPages; page += 1) {
      const result = await listDiagnosticBundles(deps, { cursor, limit: 500 })
      items.push(...result.items)
      cursor = result.cursor
      if (!cursor) break
    }
    complete = !cursor
  }
  const unique = new Map(items.filter((item) => item.date >= fromDay).map((item) => [item.key, item]))
  const sorted = [...unique.values()]
  sorted.sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
  return { items: sorted, complete }
}

export async function downloadDiagnosticBundle(deps: Deps, key: string): Promise<Blob> {
  if (!parseBundleKey(key)) throw new Error('Pacchetto non valido.')
  const response = await authorizedFetch(`/v1/admin/object?key=${encodeURIComponent(key)}`, deps)
  return await response.blob()
}

/** Scarica il pacchetto e lo salva nel browser con un nome riconoscibile. */
export async function saveDiagnosticBundle(deps: Deps, item: Pick<DiagnosticBundleItem, 'key' | 'installationId' | 'bundleId'>): Promise<void> {
  const blob = await downloadDiagnosticBundle(deps, item.key)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${item.installationId.slice(0, 8)}-${item.bundleId}.jsonl.gz`
  link.click()
  URL.revokeObjectURL(url)
}

export function formatBundleSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
