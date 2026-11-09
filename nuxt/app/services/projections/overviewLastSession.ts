import type { SessionDocument, SessionSummary } from '~/types/telemetry'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { formatLapTime } from '~/utils/telemetryFormat'
import { readFuelHistory, summaryTiming } from '~/services/telemetry/fuelHistorySummary'

export interface OverviewSessionReference { id: string; car: string; track: string; date: string }
export interface OverviewSessionPerformance extends OverviewSessionReference {
  bestQualy: string; bestRace: string; bestAvgRace: string
}

/** Select identity as a whole, so the image, track and destination cannot diverge. */
export function selectOverviewLastSession(
  entries: OverviewSessionReference[], pending: SessionDocument[],
): OverviewSessionReference | null {
  const candidates = [...entries, ...pending.map(s => ({
    id: s.sessionId, car: s.meta.car, track: s.meta.track, date: s.meta.date_start,
  }))].filter(s => s.id && Number.isFinite(Date.parse(s.date)))
  return candidates.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] || null
}

export function buildOverviewSessionPerformance(
  reference: OverviewSessionReference, summary: SessionSummary | null, gameId = 'acc',
): OverviewSessionPerformance {
  // "Ultima" Q/G is the session's own time, the same one the Sessions list shows (audit 09/11);
  // the average has no session-wide equivalent and stays the fuel-qualified reference.
  const timing = summaryTiming(summary, gameId)
  const fuel = summary ? { ...summary, ...readFuelHistory(summary, gameId) } : null
  const compatible = Number(fuel?.best_rules_version || 0) >= BEST_RULES_VERSION
  return {
    ...reference,
    bestQualy: formatLapTime(timing.qualyMs),
    bestRace: formatLapTime(timing.raceMs),
    bestAvgRace: formatLapTime(compatible ? fuel?.best_avg_race_ms : null),
  }
}
