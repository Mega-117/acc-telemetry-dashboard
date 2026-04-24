import type { SessionDocument } from '~/composables/useTelemetryData'

export function buildActivityWindowFromSessions(params: {
  sessions: SessionDocument[]
  days?: number
  sessionTypes: { PRACTICE: number; QUALIFY: number; RACE: number }
  parseTelemetryDate: (value: any) => Date | null
  formatLocalDateKey: (date: Date) => string
}) {
  const {
    sessions,
    days = 7,
    sessionTypes,
    parseTelemetryDate,
    formatLocalDateKey
  } = params

  const now = new Date()
  const dayLabels: string[] = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
  const buckets: Array<{ key: string; day: string; practice: number; qualify: number; race: number }> = []
  const byKey = new Map<string, { key: string; day: string; practice: number; qualify: number; race: number }>()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = formatLocalDateKey(date)
    const bucket = { key, day: dayLabels[date.getDay()] || 'N/A', practice: 0, qualify: 0, race: 0 }
    buckets.push(bucket)
    byKey.set(key, bucket)
  }

  let practiceSessions = 0
  let qualifySessions = 0
  let raceSessions = 0

  for (const session of sessions) {
    const sessionDate = parseTelemetryDate(session.meta.date_start)
    if (!sessionDate) continue
    const bucket = byKey.get(formatLocalDateKey(sessionDate))
    if (!bucket) continue

    const minutes = Math.round((session.summary?.totalTime || 0) / 60000)
    switch (session.meta.session_type) {
      case sessionTypes.PRACTICE:
        bucket.practice += minutes
        practiceSessions++
        break
      case sessionTypes.QUALIFY:
        bucket.qualify += minutes
        qualifySessions++
        break
      case sessionTypes.RACE:
        bucket.race += minutes
        raceSessions++
        break
    }
  }

  return {
    data: buckets.map(({ day, practice, qualify, race }) => ({ day, practice, qualify, race })),
    totals: {
      practice: { minutes: buckets.reduce((sum, bucket) => sum + bucket.practice, 0), sessions: practiceSessions },
      qualify: { minutes: buckets.reduce((sum, bucket) => sum + bucket.qualify, 0), sessions: qualifySessions },
      race: { minutes: buckets.reduce((sum, bucket) => sum + bucket.race, 0), sessions: raceSessions }
    }
  }
}

export function getTrackActivityTotalsFromSessions(
  sessions: SessionDocument[],
  formatDriveTime: (ms: number) => string
) {
  let totalLaps = 0
  let validLaps = 0
  let totalTimeMs = 0

  for (const session of sessions) {
    totalLaps += session.summary?.laps || 0
    validLaps += session.summary?.lapsValid || 0
    totalTimeMs += session.summary?.totalTime || 0
  }

  return {
    totalLaps,
    validLaps,
    validPercent: totalLaps > 0 ? Math.round((validLaps / totalLaps) * 100) : 0,
    totalTimeMs,
    totalTimeFormatted: formatDriveTime(totalTimeMs),
    sessionCount: sessions.length
  }
}

export function getHistoricalBestTimesFromSessions(sessions: SessionDocument[], grip?: string) {
  return [...sessions]
    .sort((a, b) => (a.meta.date_start || '').localeCompare(b.meta.date_start || ''))
    .map((session) => {
      const summary = session.summary
      const bestQualy = grip && summary?.best_by_grip?.[grip]
        ? summary.best_by_grip[grip].bestQualy
        : summary?.best_qualy_ms || null
      const bestRace = grip && summary?.best_by_grip?.[grip]
        ? summary.best_by_grip[grip].bestRace
        : summary?.best_race_ms || null

      return {
        date: session.meta.date_start,
        sessionId: session.sessionId,
        bestQualy,
        bestRace,
        sessionType: session.meta.session_type
      }
    })
    .filter((point) => point.bestQualy || point.bestRace)
}
