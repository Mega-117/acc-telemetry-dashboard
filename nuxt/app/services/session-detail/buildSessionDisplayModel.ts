import type { FullSession } from '~/composables/useTelemetryData'
import type { SessionDisplayModel, SessionDisplayLap, SessionDisplayStint } from '~/types/sessionDisplayModel'

export function createEmptySessionDisplayModel(sessionId: string): SessionDisplayModel {
  return {
    id: sessionId,
    track: 'Caricamento...',
    trackId: '',
    type: 'practice',
    date: '-',
    time: '-',
    car: '-',
    startConditions: { weather: '-', airTemp: 0, trackTemp: 0 },
    bestQualy: '--:--.---',
    bestRace: '--:--.---',
    theoQualy: '--:--.---',
    theoRace: '--:--.---',
    bestDeltaQ: { value: '-', stintNum: 0 },
    bestDeltaR: { value: '-', stintNum: 0 },
    stints: [],
    lapsData: {}
  }
}

export function buildSessionDisplayModel(params: {
  sessionId: string
  fullSession: FullSession | null
  maxReasonableLapMs: number
  formatLapTime: (ms: number | null | undefined) => string
  formatCarName: (car: string) => string
  formatDateFull: (date: string) => string
  formatTime: (date: string) => string
  getSessionTypeLabel: (type: number) => 'race' | 'qualify' | 'practice'
}): SessionDisplayModel {
  const {
    sessionId,
    fullSession,
    maxReasonableLapMs,
    formatLapTime,
    formatCarName,
    formatDateFull,
    formatTime,
    getSessionTypeLabel
  } = params

  if (!fullSession) {
    return createEmptySessionDisplayModel(sessionId)
  }

  const fs = fullSession
  const info = fs.session_info
  const minValidLapsForAvg = 5
  const sessionBestLap = (
    info.session_best_lap &&
    info.session_best_lap > 0 &&
    info.session_best_lap <= maxReasonableLapMs
  ) ? info.session_best_lap : 0

  const stints: SessionDisplayStint[] = fs.stints.map((stint) => {
    const validLaps = stint.laps.filter((lap) => lap.is_valid && !lap.has_pit_stop)
    const validLapsCount = validLaps.length
    const bestLapMs = validLapsCount > 0 ? Math.min(...validLaps.map((lap) => lap.lap_time_ms)) : null
    const avgLapMs = validLapsCount >= minValidLapsForAvg && stint.avg_clean_lap ? stint.avg_clean_lap : null
    const avgWarning = validLapsCount > 0 && validLapsCount < minValidLapsForAvg

    return {
      number: stint.stint_number,
      type: stint.type === 'Qualify' ? 'Q' : 'R',
      intent: stint.type === 'Qualify' ? 'Qualy Push' : 'Race Pace',
      fuelStart: stint.fuel_start,
      laps: stint.laps.length,
      validLapsCount,
      best: bestLapMs ? formatLapTime(bestLapMs) : '—',
      bestMs: bestLapMs,
      avg: avgLapMs ? formatLapTime(avgLapMs) : (avgWarning ? 'min 5 giri' : '—'),
      avgWarning,
      avgMs: avgLapMs,
      durationMs: stint.stint_drive_time_ms || 0,
      theoretical: formatLapTime(sessionBestLap),
      deltaVsTheo: bestLapMs && sessionBestLap ? `+${((bestLapMs - sessionBestLap) / 1000).toFixed(3)}` : '-',
      conditions: {
        weather: info.start_weather,
        avgAirTemp: info.start_air_temp,
        avgTrackTemp: info.start_road_temp
      },
      breakdown: { base: '-', deltaTemp: '-', deltaGrip: '-' }
    }
  })

  const lapsData: Record<number, SessionDisplayLap[]> = {}
  fs.stints.forEach((stint) => {
    lapsData[stint.stint_number] = stint.laps.map((lap) => ({
      lap: lap.lap_number,
      time: formatLapTime(lap.lap_time_ms),
      lap_time_ms: lap.lap_time_ms,
      delta: sessionBestLap ? `+${((lap.lap_time_ms - sessionBestLap) / 1000).toFixed(3)}` : '-',
      valid: lap.is_valid,
      pit: lap.has_pit_stop,
      sectors: lap.sector_times_ms?.map((sector) => (sector / 1000).toFixed(3)) || ['-', '-', '-'],
      sector_times_ms: lap.sector_times_ms || [],
      fuel: Math.round(lap.fuel_remaining),
      airTemp: lap.air_temp || 0,
      weather: lap.rain_intensity || 'No Rain',
      grip: lap.track_grip_status || 'Opt'
    }))
  })

  let bestQualyMs: number | null = null
  let bestRaceMs: number | null = null
  let bestQualyStintNum = 0
  let bestRaceStintNum = 0

  fs.stints.forEach((stint) => {
    const validLaps = stint.laps.filter((lap) => lap.is_valid && !lap.has_pit_stop)
    if (validLaps.length === 0) return

    const bestMs = Math.min(...validLaps.map((lap) => lap.lap_time_ms))
    if (stint.type === 'Qualify') {
      if (!bestQualyMs || bestMs < bestQualyMs) {
        bestQualyMs = bestMs
        bestQualyStintNum = stint.stint_number
      }
      return
    }

    if (!bestRaceMs || bestMs < bestRaceMs) {
      bestRaceMs = bestMs
      bestRaceStintNum = stint.stint_number
    }
  })

  return {
    id: sessionId,
    track: info.track,
    trackId: info.track.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    type: getSessionTypeLabel(info.session_type),
    date: formatDateFull(info.date_start),
    time: formatTime(info.date_start),
    car: formatCarName(info.car),
    startConditions: {
      weather: info.start_weather,
      airTemp: info.start_air_temp,
      trackTemp: info.start_road_temp
    },
    bestQualy: bestQualyMs ? formatLapTime(bestQualyMs) : '--:--.---',
    bestRace: bestRaceMs ? formatLapTime(bestRaceMs) : '--:--.---',
    theoQualy: formatLapTime(sessionBestLap),
    theoRace: formatLapTime(sessionBestLap),
    bestDeltaQ: {
      value: bestQualyMs && sessionBestLap ? `+${((bestQualyMs - sessionBestLap) / 1000).toFixed(3)}` : '-',
      stintNum: bestQualyStintNum
    },
    bestDeltaR: {
      value: bestRaceMs && sessionBestLap ? `+${((bestRaceMs - sessionBestLap) / 1000).toFixed(3)}` : '-',
      stintNum: bestRaceStintNum
    },
    stints,
    lapsData
  }
}
