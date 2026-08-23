import { timeToSeconds } from '~/services/session-detail/sessionMath'
import type {
  SessionBestSectorSummary,
  SessionComparisonRow,
  SessionDetailLap,
  SessionDetailStint
} from '~/types/sessionDetailViewModel'
import type { LapData, StintData } from '~/types/telemetry'
import { buildRawStintMetrics } from './sessionStintMetrics'

type SessionDetailSourceLap = LapData & { grip_level?: string }

export function buildSessionDetailStint(
  stint: StintData,
  formatLapTime: (value: number | null | undefined) => string
): SessionDetailStint {
  const metrics = buildRawStintMetrics(stint)
  const durationMs = stint.stint_drive_time_ms
    || stint.laps.reduce((sum, lap) => sum + (lap.lap_time_ms || 0), 0)

  return {
    number: stint.stint_number,
    type: stint.type === 'Qualify' ? 'Q' : stint.type === 'Race' ? 'R' : 'P',
    laps: stint.laps.length,
    best: formatLapTime(metrics.bestMs),
    bestMs: metrics.bestMs,
    avg: formatLapTime(metrics.avgMs),
    avgMs: metrics.avgMs,
    avgCleanLap: formatLapTime(metrics.avgMs),
    avgWarning: metrics.avgWarning,
    validLapsCount: metrics.cleanLapsCount,
    durationMs,
    deltaVsTheo: '—'
  }
}

export function buildSessionDetailLaps(
  laps: LapData[],
  formatLapTime: (value: number | null | undefined) => string
): SessionDetailLap[] {
  return laps.map((sourceLap, index) => {
    const lap = sourceLap as SessionDetailSourceLap
    const lapNumber = lap.lap_number || index + 1
    const time = formatLapTime(lap.lap_time_ms)
    return {
      lap: lapNumber,
      lapNumber,
      lap_number: lapNumber,
      time,
      lapTime: time,
      lap_time_ms: lap.lap_time_ms,
      lapTimeMs: lap.lap_time_ms,
      timeMs: lap.lap_time_ms,
      valid: lap.is_valid && !lap.has_pit_stop,
      is_valid: lap.is_valid,
      pit: lap.has_pit_stop,
      has_pit_stop: lap.has_pit_stop,
      sectors: lap.sector_times_ms.map((sector) => formatLapTime(sector)),
      sector_times_ms: lap.sector_times_ms,
      s1: formatLapTime(lap.sector_times_ms[0]),
      s2: formatLapTime(lap.sector_times_ms[1]),
      s3: formatLapTime(lap.sector_times_ms[2]),
      fuel: lap.fuel_remaining,
      fuel_remaining: lap.fuel_remaining,
      air: lap.air_temp,
      airTemp: lap.air_temp,
      air_temp: lap.air_temp,
      grip: lap.grip_level || lap.track_grip_status || 'Opt',
      grip_level: lap.grip_level,
      track_grip_status: lap.track_grip_status
    }
  })
}

export function buildBestSectorSummary(laps: SessionDetailLap[]): SessionBestSectorSummary {
  let bestS1 = Infinity
  let bestS2 = Infinity
  let bestS3 = Infinity
  let bestLapMs = Infinity

  for (const lap of laps || []) {
    if (!lap.valid || lap.pit) continue
    const sectors = lap.sector_times_ms || []
    if (sectors[0] && sectors[0] > 0 && sectors[0] < bestS1) bestS1 = sectors[0]
    if (sectors[1] && sectors[1] > 0 && sectors[1] < bestS2) bestS2 = sectors[1]
    if (sectors[2] && sectors[2] > 0 && sectors[2] < bestS3) bestS3 = sectors[2]
    const lapMs = lap.lap_time_ms || lap.lapTimeMs
    if (lapMs && lapMs > 0 && lapMs < bestLapMs) {
      bestLapMs = lapMs
    }
  }

  return {
    s1: bestS1 === Infinity ? null : bestS1,
    s2: bestS2 === Infinity ? null : bestS2,
    s3: bestS3 === Infinity ? null : bestS3,
    lapMs: bestLapMs === Infinity ? null : bestLapMs
  }
}

export function buildComparisonRows(params: {
  lapsA: SessionDetailLap[]
  lapsB: SessionDetailLap[]
}): SessionComparisonRow[] {
  const { lapsA, lapsB } = params
  const maxLaps = Math.max(lapsA.length, lapsB.length)
  const rows: SessionComparisonRow[] = []

  for (let index = 0; index < maxLaps; index++) {
    const lapA = lapsA[index] || null
    const lapB = lapsB[index] || null
    let delta: number | null = null

    if (lapA && lapB) {
      const timeA = timeToSeconds(lapA.time || lapA.lapTime || '')
      const timeB = timeToSeconds(lapB.time || lapB.lapTime || '')
      if (timeA > 0 && timeB > 0) {
        delta = timeA - timeB
      }
    }

    rows.push({
      index: index + 1,
      lapA,
      lapB,
      delta,
      deltaFormatted: delta !== null ? (delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)) : '—',
      deltaClass: delta !== null ? (delta < 0 ? 'faster' : delta <= 0.3 ? 'close' : delta <= 0.5 ? 'margin' : 'far') : 'neutral',
      _isStintStartA: lapA?._isStintStart || false,
      _isStintStartB: lapB?._isStintStart || false,
      _stintNumberA: lapA?._stintNumber || null,
      _stintNumberB: lapB?._stintNumber || null
    })
  }

  return rows
}
