import { describe, expect, it } from 'vitest'
import { buildSessionDisplayModel } from '~/services/session-detail/buildSessionDisplayModel'
import { buildBestSectorSummary, buildSessionDetailLaps } from '~/services/session-detail/sessionComparisonTableService'
import { buildIncludedLapSummary, normalizeLapSeries } from '~/services/session-detail/sessionLapSeries'
import type { FullSession, LapData } from '~/types/telemetry'

// PIP-591 (X-A05-24): uscita box e settori inaffidabili restano fuori dai riferimenti del dettaglio.
function lap(number: number, time: number, over: Partial<LapData> = {}): LapData {
  return {
    lap_number: number, lap_time_ms: time, elapsed_time_ms: time * number, fuel_start: 40, fuel_remaining: 39,
    air_temp: 24, road_temp: 31, rain_intensity: 'No Rain', track_grip_status: 'Fast', is_valid: true,
    is_first_stint_lap: number === 1, has_pit_stop: false, pit_out_lap: false, sectors_reliable: true,
    sector_times_ms: [30_000, 30_000, time - 60_000], ...over,
  }
}

const laps = [
  // Uscita box valida e piu' veloce di tutti: non deve diventare il riferimento.
  lap(1, 80_000, { pit_out_lap: true, sector_times_ms: [20_000, 30_000, 30_000] }),
  // Settori segnati come inaffidabili: il tempo giro vale, i settori no.
  lap(2, 91_000, { sectors_reliable: false, sector_times_ms: [10_000, 40_000, 41_000] }),
  lap(3, 92_000), lap(4, 93_000), lap(5, 94_000), lap(6, 95_000),
]
const formatLapTime = (value: number | null | undefined) => value == null ? '—' : `${value}ms`

describe('session detail reliability flags (PIP-591)', () => {
  it('the comparison adapter keeps the flags and the best-sector summary honours them', () => {
    const detailLaps = buildSessionDetailLaps(laps, formatLapTime)
    expect(detailLaps[0]).toMatchObject({ pitOut: true, sectorsReliable: true })
    expect(detailLaps[1]).toMatchObject({ pitOut: false, sectorsReliable: false })
    const summary = buildBestSectorSummary(detailLaps)
    expect(summary.lapMs).toBe(91_000)
    expect(summary.s1).toBe(30_000)
  })

  it('the display model keeps the flags, and the included-laps summary leaves the out-lap out', () => {
    const session = {
      session_info: { track: 'monza', car: 'ferrari_296_gt3', driver: 'D', session_type: 2, date_start: '2026-10-23T18:00:00Z',
        date_end: '2026-10-23T18:30:00Z', start_weather: 'Clear', start_air_temp: 24, start_road_temp: 31 },
      stints: [{ stint_number: 1, type: 'Race', fuel_start: 40, avg_clean_lap: 0, stint_drive_time_ms: 0, laps }],
    } as unknown as FullSession
    const model = buildSessionDisplayModel({
      sessionId: 'pip591', fullSession: session, maxReasonableLapMs: 600_000,
      formatLapTime: (ms) => (ms == null ? '-' : `1:${String(Math.floor((ms - 60_000) / 1000)).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`),
      formatCarName: (car) => car, formatDateFull: (date) => date, formatTime: (date) => date,
      getSessionTypeLabel: () => 'race',
    })
    const displayLaps = model.lapsData[1]!
    expect(displayLaps[0]).toMatchObject({ pitOut: true })
    expect(displayLaps[1]).toMatchObject({ sectorsReliable: false })
    const points = normalizeLapSeries({ laps: displayLaps, source: 'a', strategy: 'A', stintNumber: 1 })
    const summary = buildIncludedLapSummary(points)
    expect(summary.validLapsCount).toBe(5)
    expect(summary.bestMs).toBe(91_000)
  })

  it('data written before the flags existed keeps working as before', () => {
    const legacy = laps.map(({ pit_out_lap: _pitOut, sectors_reliable: _reliable, ...rest }) => rest as unknown as LapData)
    const detailLaps = buildSessionDetailLaps(legacy, formatLapTime)
    expect(detailLaps[0]).toMatchObject({ pitOut: false, sectorsReliable: true })
    expect(buildBestSectorSummary(detailLaps).lapMs).toBe(80_000)
  })
})
