import type { SessionDocument, SessionSummary } from '~/types/telemetry'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { formatLapTime, parseTelemetryDate } from '~/utils/telemetryFormat'
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

type SessionRef = { id: string; date: string }

/**
 * PIP-767: where the Panoramica's "Ultima sessione" goes at the click: the session on this computer
 * when it started after the one the page shows (the running one, opened hours later), otherwise the
 * shown one. An unreadable date never wins over a readable one.
 */
export function pickLastSessionTarget(shown: SessionRef | null, local: SessionRef | null): SessionRef | null {
  if (!local?.id) return shown?.id ? shown : null
  if (!shown?.id || shown.id === local.id) return local
  const localAt = parseTelemetryDate(local.date)?.getTime()
  const shownAt = parseTelemetryDate(shown.date)?.getTime()
  if (localAt === undefined || !Number.isFinite(localAt)) return shown
  if (shownAt === undefined || !Number.isFinite(shownAt)) return local
  return localAt > shownAt ? local : shown
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
