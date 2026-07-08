import type { SpotterVoiceId } from '~/composables/useSpotterVoiceSettings'

export interface TrackVoiceReference {
  id: string
  track: string
  type?: string
  normalized_car_position: number
  label?: string
  text?: string
  audio_path?: string
  audio_voice?: SpotterVoiceId | string
  audio_paths?: Partial<Record<SpotterVoiceId | string, string>>
  enabled?: boolean
  timing_offset_sec?: number | null
}

export function normalizeTrackName(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

export function crossedReferencePoint(previous: number, current: number, target: number) {
  if (previous <= current) return previous < target && target <= current
  return target > previous || target <= current
}

export function forwardNormalizedDelta(previous: number, current: number) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 0
  if (current >= previous) return current - previous
  return 1 - previous + current
}

export function normalizedSpeedPerSecond(previous: number, current: number, elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  return forwardNormalizedDelta(previous, current) / (elapsedMs / 1000)
}

// Arming level-triggered (PIP-220): i riferimenti sono attivi appena risulta
// completato almeno un giro (fine out-lap), indipendentemente dall'osservazione
// dell'incremento — live_state e' event-driven/freshness-gated e puo' saltare
// da null direttamente a N, perdendo l'edge 0 -> 1.
export function shouldArmTrackVoiceReferences(lapsCompleted: number | null | undefined) {
  return typeof lapsCompleted === 'number' && Number.isFinite(lapsCompleted) && lapsCompleted >= 1
}

// Vero solo tra due campioni numerici freschi: le transizioni da/verso null
// (dato stale) non sono passaggi di giro e non devono annunciare tempi.
export function isLapCountIncrement(previous: number | null | undefined, current: number | null | undefined) {
  return typeof previous === 'number' && typeof current === 'number' && current > previous
}

// Range unico del timing offset (PIP-217): server Nuxt e kokoroRuntime desktop
// replicano gli stessi limiti nei loro clamp.
export const TRACK_VOICE_TIMING_OFFSET_MIN_SEC = -10
export const TRACK_VOICE_TIMING_OFFSET_MAX_SEC = 10

export function clampTimingOffsetSec(value: unknown) {
  const rounded = Math.round(Number(value) || 0)
  return Math.max(TRACK_VOICE_TIMING_OFFSET_MIN_SEC, Math.min(TRACK_VOICE_TIMING_OFFSET_MAX_SEC, rounded))
}

export function wrapNormalizedPosition(value: number) {
  if (!Number.isFinite(value)) return 0
  return ((value % 1) + 1) % 1
}

// Appena sotto 1: un punto spinto oltre il traguardo resta annunciabile
// sull'ultimo tratto del giro invece di "trasferirsi" al giro dopo.
const MAX_EFFECTIVE_REFERENCE_POSITION = 1 - 1e-6

export function effectiveReferencePosition(point: Pick<TrackVoiceReference, 'normalized_car_position' | 'timing_offset_sec'>, speedPerSecond: number) {
  const offsetSec = clampTimingOffsetSec(point.timing_offset_sec)
  const base = wrapNormalizedPosition(point.normalized_car_position)
  if (offsetSec === 0 || !Number.isFinite(speedPerSecond) || speedPerSecond <= 0) {
    return base
  }
  // PIP-216: l'offset anticipa/ritarda dentro il giro ma non puo' mai
  // spostare il punto oltre il traguardo (in nessuna direzione).
  const shifted = base + offsetSec * speedPerSecond
  return Math.min(Math.max(shifted, 0), MAX_EFFECTIVE_REFERENCE_POSITION)
}

// Un passo indietro sotto questa soglia e' jitter/spin/retromarcia, non un
// passaggio del traguardo: nessun crossing e stima velocita' scartata.
export const TRACK_VOICE_WRAP_BACKWARD_THRESHOLD = 0.5
// Avanzamento massimo plausibile tra due tick (~250ms): oltre, il campione e'
// un recupero da dato stale — i punti scavalcati si consumano senza annuncio.
export const TRACK_VOICE_MAX_ANNOUNCE_TICK_DELTA = 0.1

export interface TrackVoiceReferenceTickInput {
  previous: number
  current: number
  elapsedMs: number
  playedIds: ReadonlySet<string>
  references: TrackVoiceReference[]
}

export interface TrackVoiceReferenceTickResult {
  playedIds: Set<string>
  toAnnounce: TrackVoiceReference[]
}

// PIP-216: unico punto di verita' dell'avanzamento riferimenti. Contratto:
// ogni punto e' annunciato esattamente una volta per giro quando l'auto lo
// supera, anche se il campionamento l'ha scavalcato; il ciclo del giro viene
// dal flusso di posizione (wrap reale), non dagli eventi lap del live state.
export function advanceTrackVoiceReferenceTick(input: TrackVoiceReferenceTickInput): TrackVoiceReferenceTickResult {
  const { previous, current, elapsedMs, playedIds, references } = input
  const backwardDistance = previous - current
  if (backwardDistance > 0 && backwardDistance < TRACK_VOICE_WRAP_BACKWARD_THRESHOLD) {
    return { playedIds: new Set(playedIds), toAnnounce: [] }
  }
  const isWrap = backwardDistance >= TRACK_VOICE_WRAP_BACKWARD_THRESHOLD
  const forwardDelta = forwardNormalizedDelta(previous, current)
  const plausibleTick = forwardDelta <= TRACK_VOICE_MAX_ANNOUNCE_TICK_DELTA
  const speedPerSecond = plausibleTick ? normalizedSpeedPerSecond(previous, current, elapsedMs) : 0

  const crossed = references
    .map(point => ({ point, target: effectiveReferencePosition(point, speedPerSecond) }))
    .filter(({ target }) => crossedReferencePoint(previous, current, target))
    .sort((a, b) => forwardNormalizedDelta(previous, a.target) - forwardNormalizedDelta(previous, b.target))

  // Sul wrap il set per-giro riparte: restano segnati solo i punti gia'
  // superati dopo il traguardo; quelli di fine giro appartengono al giro chiuso.
  const nextPlayedIds = isWrap ? new Set<string>() : new Set(playedIds)
  const toAnnounce: TrackVoiceReference[] = []
  for (const { point, target } of crossed) {
    const inClosedLapSegment = isWrap && target > previous
    if (inClosedLapSegment) {
      if (!playedIds.has(point.id) && plausibleTick) toAnnounce.push(point)
      continue
    }
    if (nextPlayedIds.has(point.id)) continue
    nextPlayedIds.add(point.id)
    if (plausibleTick) toAnnounce.push(point)
  }
  return { playedIds: nextPlayedIds, toAnnounce }
}

export function resolveTrackVoiceReferenceAudioPath(
  point: TrackVoiceReference,
  voice: SpotterVoiceId,
) {
  const multiVoicePath = point.audio_paths?.[voice]?.trim()
  if (multiVoicePath) return multiVoicePath

  const legacyVoice = point.audio_voice || 'if_sara'
  if (point.audio_path && legacyVoice === voice) return point.audio_path
  return ''
}

// PIP-223: dizionario voce -> WAV completo di un punto, con la coppia legacy
// (audio_path/audio_voice, default if_sara come nel resolve) migrata dentro.
// audio_paths esplicito vince sul legacy, come in resolveTrackVoiceReferenceAudioPath.
export function collectReferenceAudioPaths(point: TrackVoiceReference): Record<string, string> {
  const audioPaths: Record<string, string> = {}
  for (const [voice, path] of Object.entries(point.audio_paths || {})) {
    if (typeof path === 'string' && path.trim()) audioPaths[voice] = path
  }
  const legacyVoice = String(point.audio_voice || 'if_sara')
  if (point.audio_path && !audioPaths[legacyVoice]) audioPaths[legacyVoice] = point.audio_path
  return audioPaths
}

// PIP-223: entry di salvataggio costruita dal punto grezzo + campi editati.
// La riga della UI riflette la voce selezionata; il salvataggio non deve mai
// perdere o riassegnare i WAV delle altre voci. Un audio_paths esplicito
// nell'editato (es. WAV appena generato o azzerato) e' autoritativo; senza,
// la base audio viene dal punto grezzo.
export function buildReferenceSaveEntry<T extends TrackVoiceReference>(raw: T, edited: T, voice: SpotterVoiceId): T {
  const audioPaths = edited.audio_paths
    ? collectReferenceAudioPaths({ ...edited, audio_path: '' })
    : collectReferenceAudioPaths(raw)
  const audioPath = audioPaths[voice] || ''
  return {
    ...raw,
    ...edited,
    audio_paths: audioPaths,
    audio_path: audioPath,
    audio_voice: voice,
  }
}

export function filterPlayableTrackVoiceReferences(
  points: TrackVoiceReference[],
  voice: SpotterVoiceId,
) {
  return points
    .map(point => ({
      ...point,
      audio_path: resolveTrackVoiceReferenceAudioPath(point, voice),
      audio_voice: voice,
    }))
    .filter(point => point.enabled !== false && point.type === 'braking_reference' && !!point.audio_path)
    .sort((a, b) => a.normalized_car_position - b.normalized_car_position)
}
