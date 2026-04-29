import type { SessionDocument } from '~/composables/useTelemetryData'
import type { CarCategory } from '~/composables/useTelemetryData'
import type { TrackDetailProjection, TrackHistoricalPointProjection, TrackRecentSessionProjection } from '~/types/trackProjections'

export function buildTrackDetailProjection(params: {
  trackId: string
  metadata: { name: string; fullName: string; country: string; countryCode: string; length: string; turns: number; image: string }
  visibleSessions: SessionDocument[]
  selectedGrip: string
  selectedCategory: CarCategory
  recalculatedBestByGrip: Record<string, any>
  bestFuelData: { qualyFuel: number | null; raceFuel: number | null }
  formatLapTime: (ms: number | null | undefined) => string
  formatDriveTime: (ms: number) => string
  formatCarName: (car: string) => string
  getSessionTypeLabel: (type: number) => 'practice' | 'qualify' | 'race'
  currentTrackStat?: { lastSession?: string | null } | null
}): TrackDetailProjection {
  const {
    trackId,
    metadata,
    visibleSessions,
    selectedGrip,
    selectedCategory,
    recalculatedBestByGrip,
    bestFuelData,
    formatLapTime,
    formatDriveTime,
    formatCarName,
    getSessionTypeLabel,
    currentTrackStat
  } = params

  const gripBests = recalculatedBestByGrip[selectedGrip] || {}

  const recentSessions: TrackRecentSessionProjection[] = visibleSessions.map((session) => {
    const summary = session.summary || {}
    const sessionRaceTime = (summary as any)?.best_session_race_ms || summary.best_race_ms || null
    let bestQualy: string | undefined
    let bestRace: string | undefined

    if (summary.best_qualy_ms) {
      bestQualy = formatLapTime(summary.best_qualy_ms)
    }
    if (sessionRaceTime) {
      bestRace = formatLapTime(sessionRaceTime)
    }

    const dateObj = new Date(session.meta.date_start)
    return {
      id: session.sessionId,
      date: session.meta.date_start?.split('T')[0] || '',
      time: dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      type: getSessionTypeLabel(session.meta.session_type),
      car: formatCarName(session.meta.car),
      laps: summary.laps || 0,
      stints: summary.stintCount || 0,
      bestQualy,
      bestRace
    }
  })

  const historicalTimes: TrackHistoricalPointProjection[] = [...visibleSessions]
    .sort((a, b) => (a.meta.date_start || '').localeCompare(b.meta.date_start || ''))
    .map((session) => {
      const summary = session.summary as any
      const dateStr = session.meta.date_start?.split('T')[0] || ''
      const [_, month, day] = dateStr.split('-')
      const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
      const dateLabel = day && month ? `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1] || 'N/A'}` : 'N/A'

      const qualyTime: number | null = summary?.best_qualy_ms || null
      const raceTime: number | null = summary?.best_race_ms || null

      return {
        date: dateLabel,
        sessionId: session.sessionId,
        bestQualy: qualyTime ? formatLapTime(qualyTime) : undefined,
        bestRace: raceTime ? formatLapTime(raceTime) : undefined
      }
    })

  const totalLaps = visibleSessions.reduce((sum, session) => sum + Number(session.summary?.laps || 0), 0)
  const validLaps = visibleSessions.reduce((sum, session) => sum + Number(session.summary?.lapsValid || 0), 0)
  const totalTimeMs = visibleSessions.reduce((sum, session) => sum + Number(session.summary?.totalTime || 0), 0)

  return {
    track: {
      id: trackId,
      name: metadata.name,
      fullName: metadata.fullName,
      country: metadata.country,
      countryCode: metadata.countryCode,
      length: metadata.length,
      turns: metadata.turns,
      image: metadata.image,
      sessions: visibleSessions.length,
      lastSession: visibleSessions[0]?.meta.date_start || currentTrackStat?.lastSession || '-',
      bestQualy: gripBests.bestQualy ? formatLapTime(gripBests.bestQualy) : null,
      bestRace: gripBests.bestRace ? formatLapTime(gripBests.bestRace) : null,
      bestAvgRace: gripBests.bestAvgRace ? formatLapTime(gripBests.bestAvgRace) : null,
      bestQualyConditions: gripBests.bestQualy ? { airTemp: gripBests.bestQualyTemp || 0, roadTemp: 0, grip: selectedGrip } : null,
      bestRaceConditions: gripBests.bestRace ? { airTemp: gripBests.bestRaceTemp || 0, roadTemp: 0, grip: selectedGrip } : null,
      bestAvgRaceConditions: gripBests.bestAvgRace ? { airTemp: gripBests.bestAvgRaceTemp || 0, roadTemp: 0, grip: selectedGrip } : null,
      bestQualySessionId: gripBests.bestQualySessionId || null,
      bestRaceSessionId: gripBests.bestRaceSessionId || null,
      bestAvgRaceSessionId: gripBests.bestAvgRaceSessionId || null,
      bestQualyDate: gripBests.bestQualyDate || null,
      bestRaceDate: gripBests.bestRaceDate || null,
      bestAvgRaceDate: gripBests.bestAvgRaceDate || null,
      bestQualyFuel: bestFuelData.qualyFuel,
      bestRaceFuel: bestFuelData.raceFuel,
      hasGripData: !!gripBests.bestQualy || !!gripBests.bestRace || !!gripBests.bestAvgRace
    },
    recentSessions,
    historicalTimes,
    activity: {
      totalLaps,
      validLaps,
      validPercent: totalLaps > 0 ? Math.round((validLaps / totalLaps) * 100) : 0,
      totalTimeMs,
      totalTimeFormatted: formatDriveTime(totalTimeMs),
      sessionCount: visibleSessions.length
    },
    category: selectedCategory,
    grip: selectedGrip
  }
}
