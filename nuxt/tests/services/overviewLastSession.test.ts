import { describe, it, expect } from 'vitest'
import { selectOverviewLastSession, buildOverviewSessionPerformance } from '~/services/projections/overviewLastSession'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import type { SessionDocument, SessionSummary } from '~/types/telemetry'
import { buildOverviewProjection } from '~/services/projections/buildOverviewProjection'

const reference = { id: 'latest', car: 'Ferrari 296 GT3', track: 'monza', date: '2026-09-16T10:00:00Z' }
const summary = (values: Partial<SessionSummary>) => ({ best_rules_version: BEST_RULES_VERSION, ...values } as SessionSummary)
describe('overview last session', () => {
  it('keeps the hero track and historical times aligned with the session when track stats lag', () => {
    const result = buildOverviewProjection({
      lastSession: buildOverviewSessionPerformance(reference, null),
      lastUsedCar: reference.car, lastSessionDate: reference.date,
      trackStats: [{ track: 'spa', lastSession: reference.date }],
      bestsByTrack: { monza: { bestQualy: 90000, bestRace: null, bestAvgRace: null } },
      activity7d: [], activityTotals: { practice: { minutes: 0, sessions: 0 }, qualify: { minutes: 0, sessions: 0 }, race: { minutes: 0, sessions: 0 } },
      normalizeTrackId: value => value || '', formatLapTime: value => String(value),
      formatCarName: value => value, formatTrackName: value => value, formatDate: value => value,
    })
    expect(result.lastTrack?.id).toBe('monza')
    expect(result.lastTrack?.bestQualy).toBe('90000')
  })
  it('selects the newest identity even when the index is unsorted', () => {
    expect(selectOverviewLastSession([{ ...reference, id: 'old', date: '2026-01-01' }, reference], [])).toEqual(reference)
  })
  it('lets newer pending local data win without mixing car and track', () => {
    const pending = { sessionId: 'pending', meta: { car: 'BMW', track: 'spa', date_start: '2026-09-17' } } as SessionDocument
    expect(selectOverviewLastSession([reference], [pending])).toEqual({ id: 'pending', car: 'BMW', track: 'spa', date: '2026-09-17' })
  })
  it('does not invent a last session for empty or invalid data', () => {
    expect(selectOverviewLastSession([], [])).toBeNull()
    expect(selectOverviewLastSession([{ ...reference, date: 'invalid' }], [])).toBeNull()
  })
  it('keeps race and average empty for a qualifying-only session', () => {
    const result = buildOverviewSessionPerformance(reference, summary({ best_qualy_ms: 91310 }))
    expect(result.bestQualy).toBe('1:31.310')
    expect(result.bestRace).toBe('--:--.---')
    expect(result.bestAvgRace).toBe('--:--.---')
  })
  it('uses canonical race references, never the broad session best', () => {
    const result = buildOverviewSessionPerformance(reference, summary({ best_session_race_ms: 90000, best_race_ms: 94295, best_avg_race_ms: 94692 }))
    expect(result.bestRace).toBe('1:34.295')
    expect(result.bestAvgRace).toBe('1:34.692')
    expect(result.bestQualy).toBe('--:--.---')
  })
  it('does not label outdated or missing summaries as valid race references', () => {
    expect(buildOverviewSessionPerformance(reference, summary({ best_rules_version: 0, best_race_ms: 90000 })).bestRace).toBe('--:--.---')
    expect(buildOverviewSessionPerformance(reference, null).id).toBe('latest')
  })
})
