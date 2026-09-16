import type { SessionDocument, SessionSummary } from '~/types/telemetry'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { formatLapTime } from '~/utils/telemetryFormat'

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
  reference: OverviewSessionReference, summary: SessionSummary | null,
): OverviewSessionPerformance {
  // The broad session best is not a fuel-qualified race reference.
  const compatible = Number(summary?.best_rules_version || 0) >= BEST_RULES_VERSION
  return {
    ...reference,
    bestQualy: formatLapTime(summary?.best_qualy_ms),
    bestRace: formatLapTime(compatible ? summary?.best_race_ms : null),
    bestAvgRace: formatLapTime(compatible ? summary?.best_avg_race_ms : null),
  }
}
