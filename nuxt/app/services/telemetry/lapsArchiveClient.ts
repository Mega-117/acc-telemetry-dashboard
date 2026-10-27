// PIP-623: client dell'archivio giri sul Worker (giri condivisi, giri del pilota per il coach,
// pannello admin). Ogni giro scaricato passa dei tetti prima di essere interpretato: un file
// costruito apposta non puo' riempire la memoria della pagina.
import { DIAGNOSTICS_INGEST_ORIGIN, resolveDiagnosticsOrigin } from '~/repositories/diagnosticBundlesRepository'
import type { LapShareRef } from './lapShareLink'
import { useI18n, type TranslationKey } from '~/i18n'

export const LAP_DOWNLOAD_LIMITS = Object.freeze({ compressedBytes: 256 * 1024, jsonBytes: 4 * 1024 * 1024, channels: 40, samples: 20000 })

export class LapsArchiveError extends Error {
  constructor(message: string, readonly status = 0) { super(message) }
}
/** A downloaded lap that cannot be used, said in the interface language. */
type InvalidLapReason = 'unreadable' | 'size' | 'corrupt' | 'empty' | 'format' | 'channels' | 'tooMany' | 'tooBig'
const invalidLap = (reason: InvalidLapReason) => new LapsArchiveError(useI18n().t(`telemetry.archive.invalid.${reason}`))

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

const MESSAGES: Record<number, TranslationKey> = {
  401: 'telemetry.archive.expired',
  403: 'telemetry.archive.forbidden',
  404: 'telemetry.archive.notFound',
  503: 'telemetry.archive.paused',
}

/**
 * Richiesta al Worker e lettura del corpo con `read`, entrambe entro lo stesso tempo massimo:
 * un corpo che si blocca viene interrotto. Mai redirect: la chiave del giro va solo al Worker.
 */
async function request<T>(path: string, deps: LapsArchiveDeps, read: (response: Response) => Promise<T>, init: RequestInit = {}): Promise<T> {
  const token = await deps.getToken()
  const { t } = useI18n()
  if (!token) throw new LapsArchiveError(t('telemetry.archive.signIn'), 401)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15000)
  try {
    const response = await (deps.fetchImpl ?? fetch)(`${deps.origin ?? lapsOrigin()}${path}`, {
      ...init, redirect: 'error', headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) }, signal: controller.signal,
    })
    if (!response.ok) throw new LapsArchiveError(t(MESSAGES[response.status] ?? 'telemetry.archive.unavailable', { status: response.status }), response.status)
    // La lettura corre contro lo stesso tempo massimo: un corpo che non finisce viene interrotto.
    return await Promise.race([
      read(response),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true })),
    ])
  } catch (error) {
    if (error instanceof LapsArchiveError) throw error
    throw new LapsArchiveError(controller.signal.aborted ? t('telemetry.archive.slow') : t('telemetry.archive.unreachable'), 0)
  } finally {
    clearTimeout(timer)
  }
}

/** Legge al massimo `maxBytes` dal corpo, interrompendo appena li supera. */
async function readBytesBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw invalidLap('size')
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(await response.arrayBuffer())
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) { await reader.cancel(); throw invalidLap('size') }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength }
  return all
}

/** Decomprime con un tetto ai byte prodotti (interrompe il flusso appena lo supera). */
export async function gunzipBounded(bytes: Uint8Array, maxBytes = LAP_DOWNLOAD_LIMITS.jsonBytes): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new LapsArchiveError(useI18n().t('telemetry.archive.browser'))
  const body = new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer).body
  if (!body) throw invalidLap('empty')
  const stream = body.pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) { await reader.cancel(); throw invalidLap('tooBig') }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof LapsArchiveError) throw error
    throw invalidLap('corrupt')
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(all)
}

/** Corpo gzip del giro → oggetto JSON, con i tetti su byte, canali e campioni. */
export async function readLapBody(response: Response): Promise<unknown> {
  const buffer = await readBytesBounded(response, LAP_DOWNLOAD_LIMITS.compressedBytes)
  if (buffer.byteLength === 0) throw invalidLap('size')
  let parsed: unknown
  try { parsed = JSON.parse(await gunzipBounded(buffer)) } catch (error) {
    if (error instanceof LapsArchiveError) throw error
    throw invalidLap('unreadable')
  }
  // PIP-648: encoded laps keep their channels under `channels_qd` (older readers refuse them cleanly).
  const body = parsed as { encoding?: unknown, channels?: Record<string, unknown>, channels_qd?: Record<string, unknown> } | null
  const channels = body?.encoding === undefined ? body?.channels : body?.channels_qd
  if (!channels || typeof channels !== 'object') throw invalidLap('channels')
  const entries = Object.values(channels)
  if (entries.length > LAP_DOWNLOAD_LIMITS.channels || entries.some(v => !Array.isArray(v) || v.length > LAP_DOWNLOAD_LIMITS.samples)) {
    throw invalidLap('tooMany')
  }
  return decodeLapChannels(parsed as Record<string, unknown>)
}

/**
 * PIP-648: laps uploaded as integer deltas (`encoding: 'qdelta1'`, lapUploadPayload.js) back to values:
 * running sum / 10^decimals, rounded to those decimals. Laps without an encoding pass unchanged.
 */
const MAX_SCALED = 2 ** 40
export function decodeLapChannels(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.encoding === undefined) return payload
  const decimals = payload.channel_decimals as Record<string, unknown> | undefined
  if (payload.encoding !== 'qdelta1' || !decimals || typeof decimals !== 'object') throw invalidLap('format')
  const channels: Record<string, number[]> = {}
  // Same bound as the writer (2^40): every delta and every running sum stays an exact integer.
  const exact = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && Math.abs(n) <= MAX_SCALED
  for (const [name, deltas] of Object.entries(payload.channels_qd as Record<string, unknown[]>)) {
    const d = decimals[name]
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6) throw invalidLap('format')
    const scale = 10 ** d
    let sum = 0
    channels[name] = deltas.map((delta) => {
      if (!exact(delta) || !exact(sum + delta)) throw invalidLap('unreadable')
      sum += delta
      return sum / scale
    })
  }
  const rest = { ...payload }
  delete rest.encoding
  delete rest.channel_decimals
  delete rest.channels_qd
  return { ...rest, channels }
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

// PIP-651: `shared` = the id of a shared session: whoever has its link reads its laps (the Worker checks it is public).
export async function listPilotLaps(pilotUid: string, sessionToken: string, deps: LapsArchiveDeps, shared: string | null = null): Promise<RemoteLapDescriptor[]> {
  const laps: RemoteLapDescriptor[] = []
  let cursor: string | null = null
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(shared ? { shared } : {}) }).toString()
    const query: string = params ? `?${params}` : ''
    const body = await request(`/v1/laps/of/${encodeURIComponent(pilotUid)}/${sessionToken}${query}`, deps,
      (response) => response.json() as Promise<{ laps?: RemoteLapDescriptor[], truncated?: boolean, cursor?: string | null }>)
    laps.push(...(body.laps ?? []))
    if (!body.truncated || !body.cursor) break
    cursor = body.cursor
  }
  return laps
}

export async function fetchPilotLap(pilotUid: string, sessionToken: string, lapId: string, deps: LapsArchiveDeps, shared: string | null = null): Promise<{ trace: unknown, meta: RemoteLapMeta }> {
  return request(`/v1/laps/of/${encodeURIComponent(pilotUid)}/${sessionToken}/${lapId}${shared ? `?shared=${encodeURIComponent(shared)}` : ''}`, deps, async (response) => ({ trace: await readLapBody(response), meta: metaFrom(response) }))
}

/** PIP-650: one entry of the reference library (another driver's best lap here, with its conditions). */
export interface LibraryEntry { libId: string, uid: string, lapTimeMs: number, recordedAt: string | null, grip: string | null, airC: number | null, roadC: number | null, fuelL: number | null }

export async function listLibrary(where: { game: string, track: string, car: string, variant: string | null }, deps: LapsArchiveDeps): Promise<LibraryEntry[]> {
  const q = new URLSearchParams({ game: where.game, track: where.track, car: where.car, variant: where.variant ?? '' })
  const body = await request(`/v1/library?${q}`, deps, (response) => response.json() as Promise<{ entries?: LibraryEntry[] }>)
  return (body.entries ?? []).filter(e => /^[a-f0-9]{24}$/.test(e?.libId ?? '') && typeof e.uid === 'string' && Number.isFinite(e.lapTimeMs))
}

export async function fetchLibraryLap(libId: string, deps: LapsArchiveDeps): Promise<{ trace: unknown, meta: RemoteLapMeta }> {
  return request(`/v1/library/lap/${libId}`, deps, async (response) => ({ trace: await readLapBody(response), meta: metaFrom(response) }))
}

/** PIP-650: your consent to the reference library (on unless you switched it off in the Profile). */
export async function getLibraryPreference(deps: LapsArchiveDeps): Promise<boolean> {
  return (await request('/v1/library/preference', deps, (response) => response.json() as Promise<{ share?: boolean }>)).share !== false
}

export async function setLibraryPreference(share: boolean, deps: LapsArchiveDeps): Promise<boolean> {
  const body = await request('/v1/library/preference', deps, (response) => response.json() as Promise<{ share?: boolean }>,
    { method: 'PUT', body: JSON.stringify({ share }), headers: { 'Content-Type': 'application/json' } })
  return body.share !== false
}

export async function loadLapsSummary(deps: LapsArchiveDeps): Promise<unknown> {
  return request('/v1/admin/laps/summary', deps, (response) => response.json())
}

export async function setLapsSwitch(mode: 'auto' | 'off', deps: LapsArchiveDeps): Promise<unknown> {
  return request('/v1/admin/laps/switch', deps, (response) => response.json(), { method: 'PUT', body: JSON.stringify({ mode }), headers: { 'Content-Type': 'application/json' } })
}
