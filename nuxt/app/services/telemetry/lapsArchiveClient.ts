// PIP-623: client dell'archivio giri sul Worker (giri condivisi, giri del pilota per il coach,
// pannello admin). Ogni giro scaricato passa dei tetti prima di essere interpretato: un file
// costruito apposta non puo' riempire la memoria della pagina.
import { DIAGNOSTICS_INGEST_ORIGIN, resolveDiagnosticsOrigin } from '~/repositories/diagnosticBundlesRepository'
import type { LapShareRef } from './lapShareLink'

export const LAP_DOWNLOAD_LIMITS = Object.freeze({ compressedBytes: 256 * 1024, jsonBytes: 4 * 1024 * 1024, channels: 40, samples: 20000 })

export class LapsArchiveError extends Error {
  constructor(message: string, readonly status = 0) { super(message) }
}

export interface LapsArchiveDeps {
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
  origin?: string
  timeoutMs?: number
}

export interface RemoteLapMeta {
  ownerUid: string, sessionToken: string, lapId: string, track: string, car: string, variant: string, game: string,
  lapTimeMs: number | null, lapNumber: number | null
}

export interface RemoteLapDescriptor {
  key: string, lapId: string, ownerUid: string, sessionToken: string, size: number, receivedAt: string | null,
  track: string | null, car: string | null, variant: string, game: string | null, lapTimeMs: number | null,
  lapNumber: number | null, valid: boolean, complete: boolean
}

export function lapsOrigin(): string {
  try { return resolveDiagnosticsOrigin(useRuntimeConfig().public.diagnosticsIngestUrl) } catch { return DIAGNOSTICS_INGEST_ORIGIN }
}

const MESSAGES: Record<number, string> = {
  401: 'Sessione scaduta: accedi di nuovo.',
  403: 'Non puoi leggere questi giri.',
  404: 'Giro non trovato: il link è sbagliato o il giro è scaduto.',
  503: 'Archivio giri in pausa: riprova più tardi.',
}

/**
 * Richiesta al Worker e lettura del corpo con `read`, entrambe entro lo stesso tempo massimo:
 * un corpo che si blocca viene interrotto. Mai redirect: la chiave del giro va solo al Worker.
 */
async function request<T>(path: string, deps: LapsArchiveDeps, read: (response: Response) => Promise<T>, init: RequestInit = {}): Promise<T> {
  const token = await deps.getToken()
  if (!token) throw new LapsArchiveError('Accedi per usare i giri condivisi.', 401)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15000)
  try {
    const response = await (deps.fetchImpl ?? fetch)(`${deps.origin ?? lapsOrigin()}${path}`, {
      ...init, redirect: 'error', headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) }, signal: controller.signal,
    })
    if (!response.ok) throw new LapsArchiveError(MESSAGES[response.status] ?? `Archivio giri non disponibile (${response.status}).`, response.status)
    // La lettura corre contro lo stesso tempo massimo: un corpo che non finisce viene interrotto.
    return await Promise.race([
      read(response),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true })),
    ])
  } catch (error) {
    if (error instanceof LapsArchiveError) throw error
    throw new LapsArchiveError(controller.signal.aborted ? 'Archivio giri lento: tempo scaduto, riprova.' : 'Archivio giri non raggiungibile: controlla la connessione.', 0)
  } finally {
    clearTimeout(timer)
  }
}

/** Legge al massimo `maxBytes` dal corpo, interrompendo appena li supera. */
async function readBytesBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new LapsArchiveError('Giro non valido: dimensione inattesa.')
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(await response.arrayBuffer())
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) { await reader.cancel(); throw new LapsArchiveError('Giro non valido: dimensione inattesa.') }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength }
  return all
}

/** Decomprime con un tetto ai byte prodotti (interrompe il flusso appena lo supera). */
export async function gunzipBounded(bytes: Uint8Array, maxBytes = LAP_DOWNLOAD_LIMITS.jsonBytes): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new LapsArchiveError('Questo browser non sa aprire i giri condivisi.')
  const body = new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer).body
  if (!body) throw new LapsArchiveError('Giro non valido: file vuoto.')
  const stream = body.pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) { await reader.cancel(); throw new LapsArchiveError('Giro non valido: troppo grande.') }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof LapsArchiveError) throw error
    throw new LapsArchiveError('Giro non valido: file danneggiato.')
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(all)
}

/** Corpo gzip del giro → oggetto JSON, con i tetti su byte, canali e campioni. */
export async function readLapBody(response: Response): Promise<unknown> {
  const buffer = await readBytesBounded(response, LAP_DOWNLOAD_LIMITS.compressedBytes)
  if (buffer.byteLength === 0) throw new LapsArchiveError('Giro non valido: dimensione inattesa.')
  let parsed: unknown
  try { parsed = JSON.parse(await gunzipBounded(buffer)) } catch (error) {
    if (error instanceof LapsArchiveError) throw error
    throw new LapsArchiveError('Giro non valido: contenuto illeggibile.')
  }
  const channels = (parsed as { channels?: Record<string, unknown> } | null)?.channels
  if (!channels || typeof channels !== 'object') throw new LapsArchiveError('Giro non valido: mancano i canali.')
  const entries = Object.values(channels)
  if (entries.length > LAP_DOWNLOAD_LIMITS.channels || entries.some(v => !Array.isArray(v) || v.length > LAP_DOWNLOAD_LIMITS.samples)) {
    throw new LapsArchiveError('Giro non valido: troppi canali o campioni.')
  }
  return parsed
}

function metaFrom(response: Response): RemoteLapMeta {
  const h = (name: string) => response.headers.get(name) ?? ''
  const num = (name: string) => { const v = Number(h(name)); return h(name) !== '' && Number.isFinite(v) ? v : null }
  return { ownerUid: h('X-Lap-Owner-Uid'), sessionToken: h('X-Lap-Session'), lapId: h('X-Lap-Id'), track: h('X-Lap-Track'), car: h('X-Lap-Car'),
    variant: h('X-Lap-Variant'), game: h('X-Lap-Game'), lapTimeMs: num('X-Lap-Time-Ms'), lapNumber: num('X-Lap-Number') }
}

export async function fetchSharedLap(link: LapShareRef, deps: LapsArchiveDeps): Promise<{ trace: unknown, meta: RemoteLapMeta }> {
  return request(`/v1/laps/shared/${link.shareId}`, deps, async (response) => ({ trace: await readLapBody(response), meta: metaFrom(response) }),
    { headers: { 'X-Share-Key': link.key } })
}

export async function listPilotLaps(pilotUid: string, sessionToken: string, deps: LapsArchiveDeps): Promise<RemoteLapDescriptor[]> {
  const laps: RemoteLapDescriptor[] = []
  let cursor: string | null = null
  for (let page = 0; page < 5; page++) {
    const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const body = await request(`/v1/laps/of/${encodeURIComponent(pilotUid)}/${sessionToken}${query}`, deps,
      (response) => response.json() as Promise<{ laps?: RemoteLapDescriptor[], truncated?: boolean, cursor?: string | null }>)
    laps.push(...(body.laps ?? []))
    if (!body.truncated || !body.cursor) break
    cursor = body.cursor
  }
  return laps
}

export async function fetchPilotLap(pilotUid: string, sessionToken: string, lapId: string, deps: LapsArchiveDeps): Promise<{ trace: unknown, meta: RemoteLapMeta }> {
  return request(`/v1/laps/of/${encodeURIComponent(pilotUid)}/${sessionToken}/${lapId}`, deps, async (response) => ({ trace: await readLapBody(response), meta: metaFrom(response) }))
}

export async function loadLapsSummary(deps: LapsArchiveDeps): Promise<unknown> {
  return request('/v1/admin/laps/summary', deps, (response) => response.json())
}

export async function setLapsSwitch(mode: 'auto' | 'off', deps: LapsArchiveDeps): Promise<unknown> {
  return request('/v1/admin/laps/switch', deps, (response) => response.json(), { method: 'PUT', body: JSON.stringify({ mode }), headers: { 'Content-Type': 'application/json' } })
}
