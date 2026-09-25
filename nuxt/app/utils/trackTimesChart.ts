import type { TrackHistoricalPointProjection } from '~/types/trackProjections'
import { parseTelemetryDate } from '~/utils/telemetryFormat'

export type TrackChartPeriod = '7' | '30' | '90' | 'all'
export type TrackChartScale = 'focus' | 'complete'
export type TrackChartSeries = 'bestQualy' | 'bestRace'
export interface TrackChartPoint {
  x: number
  y: number | null
  original: number
  label: string
  sessionId: string
  outside: boolean
}

function lapSeconds(time?: string): number | null {
  const match = time?.match(/^(\d+):([0-5]\d)\.(\d{1,3})$/)
  if (!match) return null
  const value = Number(match[1]) * 60 + Number(match[2]) + Number(match[3]!.padEnd(3, '0')) / 1000
  return Number.isFinite(value) && value > 0 ? value : null
}

function sessionDate(point: TrackHistoricalPointProjection): Date | null {
  if (point.dateStart) {
    const parsed = parseTelemetryDate(point.dateStart)
    if (parsed) return parsed
  }
  // Older projections omit dateStart. Session IDs retain the logger's local date;
  // never infer a year from a presentation label such as "20 set".
  const match = point.sessionId.match(/^(\d{4})[_-](\d{2})[_-](\d{2})T(\d{2})[_:](\d{2})[_:](\d{2})/)
  return match ? parseTelemetryDate(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`) : null
}

function quantile(sorted: number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction
  const lower = Math.floor(index)
  const first = sorted[lower]!
  return first + ((sorted[Math.ceil(index)] ?? first) - first) * (index - lower)
}

function focusValues(values: number[]): number[] {
  if (values.length < 8) return values
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  // Focus is only a viewport. Keep every fast result (including a new PB),
  // and trim only isolated slow extremes, separately for qualy and race.
  // A 5 s floor preserves normal session variation even in consistent samples.
  const ceiling = q3 + Math.max(5, 3 * (q3 - q1))
  const retained = values.filter(value => value <= ceiling)
  return retained.length >= Math.ceil(values.length * 0.8) ? retained : values
}

/** Pure presentation model: no mutation, network access, record classification or aggregation. */
export function buildTrackTimesChart(
  history: readonly TrackHistoricalPointProjection[],
  period: TrackChartPeriod,
  scale: TrackChartScale,
  now: Date,
) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period !== 'all') start.setDate(start.getDate() - Number(period) + 1)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const dated = history.map(point => ({ point, date: sessionDate(point) }))
  const unknownDates = dated.filter(item => !item.date).length
  const selected = dated
    .filter(item => period === 'all' || (item.date && item.date >= start && item.date <= end))
    .sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity))
  const series: Record<TrackChartSeries, TrackChartPoint[]> = { bestQualy: [], bestRace: [] }
  selected.forEach(({ point, date }, x) => {
    for (const key of ['bestQualy', 'bestRace'] as const) {
      const value = lapSeconds(point[key])
      if (value === null) continue
      series[key].push({ x, y: value, original: value, sessionId: point.sessionId, outside: false,
        label: date ? date.toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : `${point.date} · data completa non disponibile` })
    }
  })
  const values = Object.values(series).flatMap(points => points.map(point => point.original))
  const focused = Object.values(series).flatMap(points => focusValues(points.map(point => point.original)))
  const range = scale === 'focus' ? focused : values
  const low = range.length ? Math.min(...range) : 0
  const high = range.length ? Math.max(...range) : 120
  const padding = Math.max(0.5, (high - low) * 0.08)
  const min = Math.max(0, Math.floor(low - padding))
  const max = Math.ceil(high + padding)
  const outside: (TrackChartPoint & { series: TrackChartSeries })[] = []
  for (const key of ['bestQualy', 'bestRace'] as const) {
    for (const point of series[key]) {
      if (point.original > max) {
        point.outside = true
        point.y = null // Break the line; never imply an interpolated or clamped lap time.
        outside.push({ ...point, series: key, y: max })
      }
    }
  }
  return { series, outside, min, max, count: values.length, sessionCount: selected.length, unknownDates,
    labels: selected.map(({ point }) => point.date) }
}
