import type { SpotterVoiceId } from '~/composables/useSpotterVoiceSettings'

export type TrackReferencePhase = 'garage' | 'outlap' | 'active' | 'pit_lane_active' | 'pit_lane_outlap'

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

export const TRACK_VOICE_SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const
export const TRACK_VOICE_DEFAULT_SPEED = 1.25

export function normalizeTrackVoiceSpeed(value: unknown, fallback = TRACK_VOICE_DEFAULT_SPEED) {
  const speed = Number(value)
  if (!Number.isFinite(speed)) return fallback
  return TRACK_VOICE_SPEED_OPTIONS.reduce((nearest, option) =>
    Math.abs(option - speed) < Math.abs(nearest - speed) ? option : nearest
  )
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

const TRACK_VOICE_SPEED_EMA_TAU_MS = 2_000
const TRACK_VOICE_MIN_SPEED_SAMPLE_MS = 50
const TRACK_VOICE_DELAY_MAX_LATE_MS = 1_000

export function updateSmoothedNormalizedSpeed(
  previous: number,
  current: number,
  elapsedMs: number,
  smoothedSpeedPerSecond: number | null,
) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < TRACK_VOICE_MIN_SPEED_SAMPLE_MS) return smoothedSpeedPerSecond
  const delta = forwardNormalizedDelta(previous, current)
  if (delta <= 0 || delta > TRACK_VOICE_MAX_ANNOUNCE_TICK_DELTA) return smoothedSpeedPerSecond
  const sample = delta / (elapsedMs / 1000)
  if (!Number.isFinite(sample) || sample <= 0) return smoothedSpeedPerSecond
  if (smoothedSpeedPerSecond === null || !Number.isFinite(smoothedSpeedPerSecond) || smoothedSpeedPerSecond <= 0) return sample
  const alpha = 1 - Math.exp(-elapsedMs / TRACK_VOICE_SPEED_EMA_TAU_MS)
  return smoothedSpeedPerSecond + alpha * (sample - smoothedSpeedPerSecond)
}

export function estimatedSecondsToReference(current: number, target: number, smoothedSpeedPerSecond: number | null) {
  if (smoothedSpeedPerSecond === null || !Number.isFinite(smoothedSpeedPerSecond) || smoothedSpeedPerSecond <= 0) return null
  return forwardNormalizedDelta(wrapNormalizedPosition(current), wrapNormalizedPosition(target)) / smoothedSpeedPerSecond
}

// PIP-228: la fase autorevole arriva dal logger, che vede pit/outlap/teleport
// nello stesso snapshot. Il contatore giri resta solo un fallback compatibile
// con logger precedenti, che non espongono ancora track_reference_phase.
export function shouldArmTrackVoiceReferences(
  phase: TrackReferencePhase | null | undefined,
  legacyLapsCompleted?: number | null,
) {
  if (phase !== null && phase !== undefined) return phase === 'active'
  return typeof legacyLapsCompleted === 'number'
    && Number.isFinite(legacyLapsCompleted)
    && legacyLapsCompleted >= 1
}

export function shouldDisarmTrackVoiceReferences(phase: TrackReferencePhase | null | undefined) {
  return phase === 'garage' || phase === 'outlap' || phase === 'pit_lane_outlap'
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
  nowMs: number
  playedIds: ReadonlySet<string>
  smoothedSpeedPerSecond: number | null
  pendingDelayed: ReadonlyMap<string, number>
  references: TrackVoiceReference[]
}

export interface TrackVoiceReferenceTickResult {
  playedIds: Set<string>
  toAnnounce: TrackVoiceReference[]
  smoothedSpeedPerSecond: number | null
  pendingDelayed: Map<string, number>
  acceptCurrentPosition: boolean
}

// PIP-216: unico punto di verita' dell'avanzamento riferimenti. Contratto:
// ogni punto e' annunciato esattamente una volta per giro quando l'auto lo
// supera, anche se il campionamento l'ha scavalcato; il ciclo del giro viene
// dal flusso di posizione (wrap reale), non dagli eventi lap del live state.
export function advanceTrackVoiceReferenceTick(input: TrackVoiceReferenceTickInput): TrackVoiceReferenceTickResult {
  const { previous, current, elapsedMs, nowMs, playedIds, references } = input
  const backwardDistance = previous - current
  if (backwardDistance > 0 && backwardDistance < TRACK_VOICE_WRAP_BACKWARD_THRESHOLD) {
    return {
      playedIds: new Set(playedIds),
      toAnnounce: [],
      smoothedSpeedPerSecond: input.smoothedSpeedPerSecond,
      pendingDelayed: new Map(input.pendingDelayed),
      acceptCurrentPosition: false,
    }
  }
  const isWrap = backwardDistance >= TRACK_VOICE_WRAP_BACKWARD_THRESHOLD
  const forwardDelta = forwardNormalizedDelta(previous, current)
  const plausibleTick = forwardDelta <= TRACK_VOICE_MAX_ANNOUNCE_TICK_DELTA
  const smoothedSpeedPerSecond = plausibleTick
    ? updateSmoothedNormalizedSpeed(previous, current, elapsedMs, input.smoothedSpeedPerSecond)
    : input.smoothedSpeedPerSecond

  // Sul wrap il set per-giro riparte: restano segnati solo i punti gia'
  // superati dopo il traguardo; quelli di fine giro appartengono al giro chiuso.
  const nextPlayedIds = isWrap ? new Set<string>() : new Set(playedIds)
  const pendingDelayed = new Map(input.pendingDelayed)
  const toAnnounce: TrackVoiceReference[] = []
  const announcedIds = new Set<string>()

  const referenceById = new Map(references.map(point => [point.id, point]))
  for (const [id, fireAtMs] of pendingDelayed) {
    const point = referenceById.get(id)
    if (!point) {
      pendingDelayed.delete(id)
      continue
    }
    // Un ritardo che oltrepasserebbe il traguardo viene pronunciato sul wrap:
    // non deve migrare al giro successivo (stesso contratto del vecchio clamp).
    const due = nowMs >= fireAtMs
    const freshEnough = plausibleTick && nowMs - fireAtMs <= TRACK_VOICE_DELAY_MAX_LATE_MS
    const plausibleWrap = isWrap && plausibleTick
    if (due || isWrap) {
      if (!playedIds.has(id) && (plausibleWrap || freshEnough)) {
        toAnnounce.push(point)
        announcedIds.add(id)
      }
      if (!isWrap) nextPlayedIds.add(id)
      pendingDelayed.delete(id)
    }
  }

  const orderedReferences = [...references].sort((a, b) =>
    forwardNormalizedDelta(current, a.normalized_car_position)
      - forwardNormalizedDelta(current, b.normalized_car_position),
  )

  for (const point of orderedReferences) {
    const offsetSec = clampTimingOffsetSec(point.timing_offset_sec)
    const base = wrapNormalizedPosition(point.normalized_car_position)
    const crossedBase = crossedReferencePoint(previous, current, base)
    const inClosedLapSegment = isWrap && base > previous
    const alreadyPlayed = inClosedLapSegment ? playedIds.has(point.id) : nextPlayedIds.has(point.id)
    if (alreadyPlayed || announcedIds.has(point.id) || pendingDelayed.has(point.id)) continue

    if (!plausibleTick) {
      if (crossedBase) {
        if (!inClosedLapSegment) nextPlayedIds.add(point.id)
      }
      continue
    }

    if (offsetSec < 0) {
      // Un anticipo non appartiene mai al giro precedente: per un punto vicino
      // al via la prima occasione valida e' il primo tick dopo il wrap.
      const etaSec = current <= base
        ? estimatedSecondsToReference(current, base, smoothedSpeedPerSecond)
        : null
      if (etaSec !== null && etaSec <= Math.abs(offsetSec)) {
        toAnnounce.push(point)
        nextPlayedIds.add(point.id)
      } else if (crossedBase) {
        // Fallback conservativo: meglio il cue sul punto che perderlo del tutto
        // quando non esiste ancora una stima di velocita' affidabile.
        toAnnounce.push(point)
        if (!inClosedLapSegment) nextPlayedIds.add(point.id)
      }
      continue
    }

    if (!crossedBase) continue
    if (offsetSec === 0 || inClosedLapSegment) {
      toAnnounce.push(point)
      if (!inClosedLapSegment) nextPlayedIds.add(point.id)
      continue
    }
    pendingDelayed.set(point.id, nowMs + offsetSec * 1_000)
  }
  return {
    playedIds: nextPlayedIds,
    toAnnounce,
    smoothedSpeedPerSecond,
    pendingDelayed,
    acceptCurrentPosition: true,
  }
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
