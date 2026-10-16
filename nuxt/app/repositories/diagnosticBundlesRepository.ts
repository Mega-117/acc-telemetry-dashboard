// PIP-540: elenco e scarico dei pacchetti diagnostici su R2, tramite il Worker (PIP-539).
// Nessuna lettura o scrittura Firestore: il Worker accetta solo l'ID token di un admin.

export const DIAGNOSTICS_INGEST_ORIGIN = 'https://racercore-diagnostics-ingest.enricosaian.workers.dev'
export const DIAGNOSTIC_BUNDLES_PAGE_SIZE = 100

const KEY = /^diag\/([A-Za-z0-9-]{8,64})\/(\d{4}-\d{2}-\d{2})\/(([a-z][a-z-]{1,15})-\d{8}T\d{6}-[0-9a-f]{8})\.jsonl\.gz$/

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
}

export interface DiagnosticBundlePage {
  items: DiagnosticBundleItem[]
  cursor: string | null
}

type Deps = { getToken: () => Promise<string | null>, fetchImpl?: typeof fetch, origin?: string }

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

async function authorizedFetch(path: string, { getToken, fetchImpl = fetch, origin = DIAGNOSTICS_INGEST_ORIGIN }: Deps) {
  const token = await getToken()
  if (!token) throw new Error('Sessione non disponibile: accedi di nuovo.')
  const response = await fetchImpl(`${origin}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new Error('Sessione scaduta: accedi di nuovo.')
  if (response.status === 403) throw new Error('Questo account non è autorizzato a leggere i pacchetti.')
  if (!response.ok) throw new Error(`Il servizio pacchetti non risponde (${response.status}).`)
  return response
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
  const body = await response.json() as {
    objects?: Array<{ key: string, size: number, uploaded: string, uid?: string | null, trigger?: string | null, os?: string | null }>
    cursor?: string | null
  }
  const items = (body.objects || []).flatMap((object) => {
    const parsed = parseBundleKey(object.key)
    return parsed ? [{
      key: object.key, ...parsed, size: object.size, uploadedAt: object.uploaded, uploaderUid: object.uid ?? null,
      trigger: object.trigger ?? null, os: object.os ?? null,
    }] : []
  })
  items.sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
  return { items, cursor: body.cursor ?? null }
}

/**
 * Pacchetti degli ultimi `days` giorni (per data del pacchetto). R2 elenca per installazione,
 * non per data: si scorrono al massimo `maxPages` pagine e si dice se l'elenco e' incompleto.
 */
export async function listRecentDiagnosticBundles(
  deps: Deps,
  { days = 7, nowMs = Date.now(), maxPages = 4 }: { days?: number, nowMs?: number, maxPages?: number } = {}
): Promise<{ items: DiagnosticBundleItem[], complete: boolean }> {
  const fromDay = new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const items: DiagnosticBundleItem[] = []
  let cursor: string | null = null
  for (let page = 0; page < maxPages; page += 1) {
    const result = await listDiagnosticBundles(deps, { cursor, limit: 500 })
    items.push(...result.items.filter((item) => item.date >= fromDay))
    cursor = result.cursor
    if (!cursor) break
  }
  items.sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
  return { items, complete: !cursor }
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
