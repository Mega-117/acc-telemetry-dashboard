import { timeToSeconds } from '~/services/session-detail/sessionMath'
import type {
  LapSeriesSource,
  LapSeriesSummary,
  NormalizedLapPoint,
  SessionDetailLap
} from '~/types/sessionDetailViewModel'

export type { LapSeriesSource, LapSeriesSummary, NormalizedLapPoint } from '~/types/sessionDetailViewModel'

export function getLapNumber(lap: SessionDetailLap, fallbackIndex: number): number {
  const value = Number(lap.lap ?? lap.lapNumber ?? lap.lap_number ?? lap.number)
  return Number.isFinite(value) && value > 0 ? value : fallbackIndex + 1
}

export function getLapTimeLabel(lap: SessionDetailLap): string {
  return String(lap.time ?? lap.lapTime ?? '')
}

export function buildLapExclusionKey(params: {
  source: LapSeriesSource
  stintNumber: number | null | undefined
  lapNumber: number | null | undefined
}): string {
  const stint = Number(params.stintNumber)
  const lap = Number(params.lapNumber)
  return `${params.source}:${Number.isFinite(stint) ? stint : 0}:${Number.isFinite(lap) ? lap : 0}`
}

export function normalizeLapSeries(params: {
  laps: SessionDetailLap[]
  source: LapSeriesSource
  strategy: 'A' | 'B'
  stintNumber: number
  stintIndex?: number
  displayStart?: number
}): NormalizedLapPoint[] {
  const displayStart = params.displayStart ?? 0
  const stintIndex = params.stintIndex ?? 0

  return (params.laps || []).map((lap, index) => {
    const stintLapNumber = getLapNumber(lap, index)
    const sessionLapNumber = Number(lap.sessionLapNumber ?? lap._sessionLapNumber ?? stintLapNumber)
    const displayIndex = displayStart + index + 1
    const time = getLapTimeLabel(lap)
    const air = Number(lap.airTemp ?? lap.air ?? lap.air_temp ?? lap.temp)
    const fuel = Number(lap.fuel ?? lap.fuel_remaining)

    return {
      raw: lap,
      source: params.source,
      strategy: params.strategy,
      stintNumber: params.stintNumber,
      stintLapNumber,
      sessionLapNumber: Number.isFinite(sessionLapNumber) && sessionLapNumber > 0 ? sessionLapNumber : stintLapNumber,
      displayIndex,
      chartIndex: displayIndex,
      exclusionKey: buildLapExclusionKey({
        source: params.source,
        stintNumber: params.stintNumber,
        lapNumber: stintLapNumber
      }),
      time,
      timeSeconds: timeToSeconds(time),
      valid: Boolean(lap.valid ?? lap.is_valid),
      pit: Boolean(lap.pit ?? lap.has_pit_stop),
      fuel: Number.isFinite(fuel) ? fuel : null,
      air: Number.isFinite(air) ? air : null,
      grip: String(lap.grip ?? lap.grip_level ?? lap.track_grip_status ?? 'Unknown'),
      isStintStart: index === 0 || Boolean(lap._isStintStart),
      stintIndex
    }
  })
}

export function normalizeStrategyLapSeries(params: {
  stints: Array<{ number: number }>
  getLaps: (stintNumber: number, stintIndex: number) => SessionDetailLap[]
  source: LapSeriesSource
  strategy: 'A' | 'B'
}): NormalizedLapPoint[] {
  const points: NormalizedLapPoint[] = []

  params.stints.forEach((stint, stintIndex) => {
    const stintPoints = normalizeLapSeries({
      laps: params.getLaps(stint.number, stintIndex),
      source: params.source,
      strategy: params.strategy,
      stintNumber: stint.number,
      stintIndex,
      displayStart: points.length
    })
    points.push(...stintPoints)
  })

  return points
}

export function filterIncludedLapPoints(
  points: NormalizedLapPoint[],
  excludedKeys: Set<string>
): NormalizedLapPoint[] {
  return points.filter((point) => !excludedKeys.has(point.exclusionKey))
}

export function buildIncludedLapSummary(
  points: NormalizedLapPoint[],
  minAverageLaps = 5
): LapSeriesSummary {
  const included = points.filter((point) => point.timeSeconds > 0)
  const valid = included.filter((point) => point.valid && !point.pit)
  const bestSeconds = valid.reduce<number | null>((best, point) => {
    return best == null ? point.timeSeconds : Math.min(best, point.timeSeconds)
  }, null)
  const avgMs = valid.length >= minAverageLaps
    ? Math.round(valid.reduce((sum, point) => sum + point.timeSeconds * 1000, 0) / valid.length)
    : null

  return {
    laps: included.length,
    validLapsCount: valid.length,
    bestMs: bestSeconds == null ? null : Math.round(bestSeconds * 1000),
    avgMs,
    avgWarning: valid.length < minAverageLaps,
    durationMs: Math.round(included.reduce((sum, point) => sum + point.timeSeconds * 1000, 0))
  }
}

export function buildLapTooltipTitle(point: NormalizedLapPoint | null | undefined): string {
  if (!point) return ''
  return `Strategia ${point.strategy} · Stint #${point.stintNumber} · Giro ${point.sessionLapNumber}`
}

export function buildLapTooltipLines(point: NormalizedLapPoint | null | undefined): string[] {
  if (!point) return []
  const state = point.pit ? 'PIT' : point.valid ? 'OK' : 'INV'
  return [
    `Giro stint: ${point.stintLapNumber}`,
    `Tempo: ${point.time || '—'}`,
    `Stato: ${state}`,
    `Fuel: ${point.fuel == null ? '—' : `${point.fuel}L`}`,
    `Air: ${point.air == null ? '—' : `${Math.round(point.air)}°C`}`,
    `Grip: ${point.grip}`
  ]
}
