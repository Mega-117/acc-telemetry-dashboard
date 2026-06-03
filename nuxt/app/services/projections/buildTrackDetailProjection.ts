import type { SessionDocument } from '~/composables/useTelemetryData'
import type { CarCategory } from '~/composables/useTelemetryData'
import type { TrackDetailProjection, TrackFuelBucketReference, TrackHistoricalPointProjection, TrackRecentSessionProjection } from '~/types/trackProjections'

const RACE_FUEL_BUCKETS = ['40-60', '60-80', '80-100', '100+'] as const

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
  const raceFuelBucket = getRaceFuelBucket(gripBests.bestRaceFuel)
  const avgRaceFuelBucket = getRaceFuelBucket(gripBests.bestAvgRaceFuel)
  const raceBucketRecord = raceFuelBucket ? gripBests.raceBestByFuelBucket?.[raceFuelBucket] : null
  const avgRaceBucketRecord = avgRaceFuelBucket ? gripBests.raceAvgByFuelBucket?.[avgRaceFuelBucket] : null
  const raceFuelBuckets: TrackFuelBucketReference[] = RACE_FUEL_BUCKETS.map((bucket) => {
    const bestRecord = normalizeFuelBucketRecord(gripBests.raceBestByFuelBucket?.[bucket])
    const avgRecord = normalizeFuelBucketRecord(gripBests.raceAvgByFuelBucket?.[bucket])
    return {
      bucket,
      bestRace: bestRecord?.timeMs ? formatLapTime(bestRecord.timeMs) : null,
      bestRaceFuel: bestRecord?.fuel ?? null,
      bestRaceAirTemp: bestRecord?.airTemp ?? null,
      bestRaceDate: bestRecord?.date ?? null,
      bestRaceSessionId: bestRecord?.sessionId ?? null,
      bestRaceSampleCount: bestRecord?.sampleLapCount ?? null,
      bestRaceConfidence: bestRecord?.confidence ?? null,
      avgRace: avgRecord?.timeMs ? formatLapTime(avgRecord.timeMs) : null,
      avgRaceFuel: avgRecord?.fuel ?? null,
      avgRaceAirTemp: avgRecord?.airTemp ?? null,
      avgRaceDate: avgRecord?.date ?? null,
      avgRaceSessionId: avgRecord?.sessionId ?? null,
      avgRaceSampleCount: avgRecord?.sampleLapCount ?? null,
      avgRaceConfidence: avgRecord?.confidence ?? null,
      hasData: !!bestRecord?.timeMs || !!avgRecord?.timeMs
    }
  })

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
      bestAvgRaceFuel: gripBests.bestAvgRaceFuel ?? null,
      bestRaceFuelBucket: raceFuelBucket,
      bestAvgRaceFuelBucket: avgRaceFuelBucket,
      bestRaceSampleCount: raceBucketRecord?.sampleLapCount ?? null,
      bestAvgRaceSampleCount: avgRaceBucketRecord?.sampleLapCount ?? null,
      bestRaceConfidence: raceBucketRecord?.confidence ?? null,
      bestAvgRaceConfidence: avgRaceBucketRecord?.confidence ?? null,
      raceFuelBuckets,
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

function getRaceFuelBucket(fuel: number | null | undefined): string | null {
  const parsed = Number(fuel || 0)
  if (!parsed || parsed <= 40) return null
  if (parsed <= 60) return '40-60'
  if (parsed <= 80) return '60-80'
  if (parsed <= 100) return '80-100'
  return '100+'
}

function normalizeFuelBucketRecord(record: any): {
  timeMs: number
  fuel: number | null
  airTemp: number | null
  date: string | null
  sessionId: string | null
  sampleLapCount: number | null
  confidence: string | null
} | null {
  const timeMs = Number(record?.timeMs || 0)
  if (!timeMs) return null
  return {
    timeMs,
    fuel: record?.fuel ?? null,
    airTemp: record?.airTemp ?? null,
    date: record?.date ?? null,
    sessionId: record?.sessionId ?? null,
    sampleLapCount: record?.sampleLapCount ?? null,
    confidence: record?.confidence ?? null
  }
}
