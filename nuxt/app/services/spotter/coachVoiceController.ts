/**
 * @description Controller puro del coach vocale adattivo (PIP-256). Fusione
 * col sistema riferimenti (decisione 2026-07-20): i marker esistenti restano
 * la "bocca", il motore coach del logger (coach_state.json, PIP-255) decide
 * il contenuto. Pre-curva: sul marker della curva-focus la correzione
 * sostituisce il riferimento standard (con fallback al riferimento se il WAV
 * coach manca). Post-curva: un solo esito per giro, subito dopo l'uscita
 * della curva-focus. Tutte le altre curve restano invariate.
 */

import type { TrackVoiceReference } from '~/services/spotter/trackVoiceReferences'

export const COACH_STATE_SCHEMA = 'acc.coach_state.v1'

/** Finestra a monte dell'apex in cui cercare il marker della curva-focus. */
export const PRE_CORNER_WINDOW = 0.06
/** Uscita curva: l'esito suona quando la posizione supera apex + offset. */
export const POST_CORNER_OFFSET = 0.02

export interface CoachFocus {
  cornerId: number
  cornerName: string | null
  apexNormPos: number
  metric: 'brake_point' | 'vmin' | 'throttle'
  direction: 'later' | 'earlier' | 'faster' | 'slower'
  magnitude: number
  timeLostS: number
}

/** Riga della tabella curva-per-curva dell'ultimo giro (PIP-258). */
export interface CoachCornerRow {
  corner_id: number
  corner_name: string | null
  apex_dist_m: number
  brake_delta_m: number | null
  vmin_delta_kmh: number
  throttle_delta_m: number | null
  time_lost_s: number
}

export interface CoachVoiceState {
  track: string
  car: string
  lapsObserved: number
  focus: CoachFocus | null
  lastLapOutcome: 'improved' | 'ok' | 'worse' | null
  lastLapCorners: CoachCornerRow[]
}

const METRICS = new Set(['brake_point', 'vmin', 'throttle'])
const DIRECTIONS = new Set(['later', 'earlier', 'faster', 'slower'])
const OUTCOMES = new Set(['improved', 'ok', 'worse'])

export function normalizeCoachState(raw: unknown): CoachVoiceState | null {
  const data = raw as Record<string, unknown> | null
  if (!data || typeof data !== 'object' || data.schema !== COACH_STATE_SCHEMA) return null
  const focusRaw = data.focus as Record<string, unknown> | null
  let focus: CoachFocus | null = null
  if (focusRaw && typeof focusRaw === 'object') {
    const apex = Number(focusRaw.apex_norm_pos)
    const metric = String(focusRaw.metric)
    const direction = String(focusRaw.direction)
    if (Number.isFinite(apex) && apex >= 0 && apex <= 1 && METRICS.has(metric) && DIRECTIONS.has(direction)) {
      focus = {
        cornerId: Number(focusRaw.corner_id) || 0,
        cornerName: typeof focusRaw.corner_name === 'string' ? focusRaw.corner_name : null,
        apexNormPos: apex,
        metric: metric as CoachFocus['metric'],
        direction: direction as CoachFocus['direction'],
        magnitude: Number(focusRaw.magnitude) || 0,
        timeLostS: Number(focusRaw.time_lost_s) || 0,
      }
    }
  }
  const outcome = typeof data.last_lap_outcome === 'string' && OUTCOMES.has(data.last_lap_outcome)
    ? data.last_lap_outcome as CoachVoiceState['lastLapOutcome']
    : null
  const rows: CoachCornerRow[] = Array.isArray(data.last_lap_corners)
    ? (data.last_lap_corners as Record<string, unknown>[])
        .filter(row => row && typeof row === 'object' && Number.isFinite(Number(row.corner_id)))
        .map(row => ({
          corner_id: Number(row.corner_id),
          corner_name: typeof row.corner_name === 'string' ? row.corner_name : null,
          apex_dist_m: Number(row.apex_dist_m) || 0,
          brake_delta_m: Number.isFinite(Number(row.brake_delta_m)) ? Number(row.brake_delta_m) : null,
          vmin_delta_kmh: Number(row.vmin_delta_kmh) || 0,
          throttle_delta_m: Number.isFinite(Number(row.throttle_delta_m)) ? Number(row.throttle_delta_m) : null,
          time_lost_s: Number(row.time_lost_s) || 0,
        }))
    : []
  return {
    track: typeof data.track === 'string' ? data.track : '',
    car: typeof data.car === 'string' ? data.car : '',
    lapsObserved: Number(data.laps_observed) || 0,
    focus,
    lastLapOutcome: outcome,
    lastLapCorners: rows,
  }
}

// ── Catalogo frasi (contratto con PIP-257: WAV `acc-voice://coach/<key>-<voice>.wav`,
//    ogni frase ≥3 parole per il vincolo Kokoro) ──────────────────────────────
export type CoachPhraseKey =
  | 'brake_point_later_small' | 'brake_point_later_big'
  | 'brake_point_earlier_small' | 'brake_point_earlier_big'
  | 'vmin_faster_small' | 'vmin_faster_big'
  | 'vmin_slower_small' | 'vmin_slower_big'
  | 'throttle_earlier_small' | 'throttle_earlier_big'
  | 'throttle_later_small' | 'throttle_later_big'
  | 'outcome_improved' | 'outcome_ok' | 'outcome_worse'

/** Soglie oltre le quali l'errore passa al bucket "big" (m o km/h). */
const BIG_MAGNITUDE = { brake_point: 35, vmin: 10, throttle: 30 } as const

export function magnitudeBucket(metric: CoachFocus['metric'], magnitude: number): 'small' | 'big' {
  return magnitude >= BIG_MAGNITUDE[metric] ? 'big' : 'small'
}

export function coachPhraseKey(focus: CoachFocus): CoachPhraseKey {
  return `${focus.metric}_${focus.direction}_${magnitudeBucket(focus.metric, focus.magnitude)}` as CoachPhraseKey
}

export function coachPhrasePath(key: CoachPhraseKey, voice: string): string {
  return `acc-voice://coach/${key}-${voice}.wav`
}

// ── Pre-curva: override del marker della curva-focus ─────────────────────────
export interface CoachOverride {
  referenceId: string
  correctionPath: string
  fallbackPath: string
}

/**
 * Sceglie il marker esistente che "possiede" la curva-focus: il piu' vicino
 * all'apex nella finestra a monte. Nessun marker in finestra = nessun
 * override (la correzione non ha un posto naturale dove suonare).
 */
export function resolveCoachOverride(
  focus: CoachFocus | null,
  references: TrackVoiceReference[],
  voice: string,
): CoachOverride | null {
  if (!focus) return null
  let best: TrackVoiceReference | null = null
  let bestGap = PRE_CORNER_WINDOW
  for (const reference of references) {
    const position = Number(reference.normalized_car_position)
    if (!Number.isFinite(position)) continue
    const gap = focus.apexNormPos - position
    if (gap >= 0 && gap <= bestGap) {
      best = reference
      bestGap = gap
    }
  }
  if (!best || !best.audio_path) return null
  return {
    referenceId: best.id,
    correctionPath: coachPhrasePath(coachPhraseKey(focus), voice),
    fallbackPath: best.audio_path,
  }
}

// ── Post-curva: un esito per giro all'uscita della curva-focus ───────────────
export interface PostCornerState {
  lastPosition: number | null
  firedThisLap: boolean
}

export function createPostCornerState(): PostCornerState {
  return { lastPosition: null, firedThisLap: false }
}

export interface PostCornerTickInput {
  position: number | null
  focus: CoachFocus | null
  outcome: CoachVoiceState['lastLapOutcome']
  voice: string
}

export function advancePostCorner(
  state: PostCornerState,
  input: PostCornerTickInput,
): { state: PostCornerState, path: string | null } {
  const { position, focus, outcome, voice } = input
  if (position === null || !Number.isFinite(position)) {
    return { state, path: null }
  }
  const next: PostCornerState = { ...state }
  // wrap del traguardo: nuovo giro, l'esito puo' suonare di nuovo
  if (next.lastPosition !== null && next.lastPosition - position > 0.5) {
    next.firedThisLap = false
  }
  const previous = next.lastPosition
  next.lastPosition = position
  if (!focus || !outcome || next.firedThisLap || previous === null) {
    return { state: next, path: null }
  }
  const trigger = Math.min(0.999, focus.apexNormPos + POST_CORNER_OFFSET)
  if (previous < trigger && position >= trigger) {
    next.firedThisLap = true
    return { state: next, path: coachPhrasePath(`outcome_${outcome}` as CoachPhraseKey, voice) }
  }
  return { state: next, path: null }
}
