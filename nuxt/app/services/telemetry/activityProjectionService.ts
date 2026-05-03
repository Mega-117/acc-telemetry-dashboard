import type { SessionDocument } from '~/composables/useTelemetryData'

export type ActivitySessionTypes = { PRACTICE: number; QUALIFY: number; RACE: number }

export interface ActivitySourceEntry {
  dateStart?: string | null
  sessionType?: number | null
  totalTimeMs?: number | null
}

export interface ActivityWindowBucket {
  date: string
  day: string
  dateLabel: string
  practice: number
  qualify: number
  race: number
}

const DAY_LABELS: [string, string, string, string, string, string, string] = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

export function formatActivityDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatActivityDateLabel(date: Date): string {
  const day = `${date.getDate()}`.padStart(2, '0')
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${day}/${month}`
}

export function getTelemetryActivityDateKey(value: string | null | undefined): string | null {
  if (!value) return null
  const text = String(value)
  const keyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (keyMatch) return `${keyMatch[1]}-${keyMatch[2]}-${keyMatch[3]}`

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return formatActivityDateKey(parsed)
}

export function buildRecentActivityBuckets(days: number = 7, now: Date = new Date()): ActivityWindowBucket[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const buckets: ActivityWindowBucket[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    buckets.push({
      date: formatActivityDateKey(date),
      day: DAY_LABELS[date.getDay()] || 'N/A',
      dateLabel: formatActivityDateLabel(date),
      practice: 0,
      qualify: 0,
      race: 0
    })
  }
  return buckets
}

export function getRecentActivityDateKeys(days: number = 7, now: Date = new Date()): string[] {
  return buildRecentActivityBuckets(days, now).map((bucket) => bucket.date)
}

export function getActivityBucketForSessionType(
  sessionType: number | null | undefined,
  sessionTypes: ActivitySessionTypes
): 'practice' | 'qualify' | 'race' | null {
  switch (sessionType) {
    case sessionTypes.PRACTICE:
      return 'practice'
    case sessionTypes.QUALIFY:
      return 'qualify'
    case sessionTypes.RACE:
      return 'race'
    default:
      return null
  }
}

export function buildActivityProjectionFromEntries(params: {
  entries: ActivitySourceEntry[]
  days?: number
  now?: Date
  sessionTypes: ActivitySessionTypes
}) {
  const { entries, days = 7, now = new Date(), sessionTypes } = params
  const buckets = buildRecentActivityBuckets(days, now)
  const byDate = new Map(buckets.map((bucket) => [bucket.date, bucket]))
  const totals = {
    practice: { minutes: 0, sessions: 0 },
    qualify: { minutes: 0, sessions: 0 },
    race: { minutes: 0, sessions: 0 }
  }

  for (const entry of entries) {
    const dateKey = getTelemetryActivityDateKey(entry.dateStart)
    if (!dateKey) continue
    const bucket = byDate.get(dateKey)
    if (!bucket) continue

    const activityBucket = getActivityBucketForSessionType(entry.sessionType, sessionTypes)
    if (!activityBucket) continue

    const minutes = Math.round(Number(entry.totalTimeMs || 0) / 60000)
    bucket[activityBucket] += minutes
    totals[activityBucket].minutes += minutes
    totals[activityBucket].sessions += 1
  }

  return {
    data: buckets,
    totals,
    byDay: buckets
      .filter((bucket) => bucket.practice > 0 || bucket.qualify > 0 || bucket.race > 0)
      .map((bucket) => ({
        date: bucket.date,
        P: bucket.practice,
        Q: bucket.qualify,
        R: bucket.race
      }))
  }
}

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
    sessionTypes
  } = params

  const projection = buildActivityProjectionFromEntries({
    entries: sessions.map((session) => ({
      dateStart: session.meta.date_start,
      sessionType: session.meta.session_type,
      totalTimeMs: session.summary?.totalTime || 0
    })),
    days,
    sessionTypes
  })

  return {
    data: projection.data,
    totals: projection.totals
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
