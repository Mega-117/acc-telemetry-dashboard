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
  const body = await response.json() as { objects?: Array<{ key: string, size: number, uploaded: string, uid?: string | null }>, cursor?: string | null }
  const items = (body.objects || []).flatMap((object) => {
    const parsed = parseBundleKey(object.key)
    return parsed ? [{ key: object.key, ...parsed, size: object.size, uploadedAt: object.uploaded, uploaderUid: object.uid ?? null }] : []
  })
  items.sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
  return { items, cursor: body.cursor ?? null }
}

export async function downloadDiagnosticBundle(deps: Deps, key: string): Promise<Blob> {
  if (!parseBundleKey(key)) throw new Error('Pacchetto non valido.')
  const response = await authorizedFetch(`/v1/admin/object?key=${encodeURIComponent(key)}`, deps)
  return await response.blob()
}

export function formatBundleSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
