import type { FullSession, LapData, StintData } from '~/types/telemetry'
import { buildBestSectorSummary, buildSessionDetailLaps } from './sessionComparisonTableService'
import { isCleanSessionLap } from './sessionStintMetrics'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'

export function recordedNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Present existing session facts; never promote live telemetry into a past lap. */
export function sessionDataReferences(session: FullSession | null) {
  const laps = session?.stints.flatMap(stint => stint.laps) ?? []
  const clean = laps.filter(isCleanSessionLap)
  const best = clean.length ? Math.min(...clean.map(lap => lap.lap_time_ms)) : null
  const reliable = clean.filter(lap => lap.sectors_reliable && lap.sector_times_ms?.length === 3)
  const sectors = buildBestSectorSummary(buildSessionDetailLaps(reliable, formatLapTime))
  const optimal = sectors.s1 && sectors.s2 && sectors.s3 ? sectors.s1 + sectors.s2 + sectors.s3 : null
  const avg = recordedNumber(session?.session_info.avg_clean_lap)
  return { best, optimal, average: avg && avg > 0 ? avg : null }
}

export function stintDataFacts(stint: StintData | undefined) {
  const laps = stint?.laps.filter(lap => Number(lap.lap_time_ms) > 0 && lap.completeness !== 'missing') ?? []
  const fuel = laps.map(lap => {
    const start = recordedNumber(lap.fuel_start), end = recordedNumber(lap.fuel_remaining)
    return start !== null && end !== null && start >= end ? start - end : null
  })
  const completeFuel = fuel.length > 0 && fuel.every(value => value !== null)
  const consumed = completeFuel ? fuel.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null
  return { duration: recordedNumber(stint?.stint_drive_time_ms), consumed,
    perLap: consumed !== null ? consumed / laps.length : null, lapCount: laps.length,
    first: laps[0], last: laps.at(-1) }
}

export function lapStatus(lap: LapData): string {
  const { t } = useI18n()
  if (lap.completeness === 'missing') return t('data.status.lost')
  if (lap.is_valid == null || lap.validity === 'unknown') return t('data.status.unknown')
  return [lap.is_valid ? t('data.status.valid') : t('data.status.invalid'), lap.pit_out_lap ? t('data.status.pitOut') : lap.has_pit_stop ? t('data.status.pit') : '', lap.completeness === 'partial' ? t('sessions.common.partial') : ''].filter(Boolean).join(' · ')
}
