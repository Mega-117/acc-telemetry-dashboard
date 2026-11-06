import type { FullSession, LapData, StintData } from '~/types/telemetry'
import { buildBestSectorSummary, buildSessionDetailLaps } from './sessionComparisonTableService'
import { isCleanSessionLap } from './sessionStintMetrics'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'

export function recordedNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * PIP-743 (dev.14 plan, point 8): the laps the Dati page draws against two other counts of the same
 * session: the logger's own counters (session_info) and the summary the Sessioni list shows. A lap
 * lost on the way (upload chunks, merge, canonical rewrite) makes them differ: lapsOff/validOff is the
 * KO. bestOff (the list's best against the best clean lap drawn) is information: the list keeps its
 * own rules for which laps count.
 */
export function sessionDataCheck(session: FullSession | null, listed: { laps?: number, lapsValid?: number, bestLap?: number | null } | null | undefined) {
  if (!session) return null
  const laps = session.stints.flatMap(stint => stint.laps)
  const valid = laps.filter(lap => lap.is_valid === true).length
  const info = session.session_info
  const counted = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null)
  const loggerLaps = counted(info?.laps_total), loggerValid = counted(info?.laps_valid)
  const listLaps = counted(listed?.laps), listValid = counted(listed?.lapsValid)
  const off = (a: number, b: number | null) => (b === null ? 0 : Math.abs(a - b))
  const best = sessionDataReferences(session).best
  const listBest = typeof listed?.bestLap === 'number' && listed.bestLap > 0 ? listed.bestLap : null
  const lapsOff = Math.max(off(laps.length, loggerLaps), off(laps.length, listLaps))
  const validOff = Math.max(off(valid, loggerValid), off(valid, listValid))
  return {
    laps: laps.length,
    lapsOff,
    validOff,
    // One number for the R2 rule: a session is one KO, however many counts differ.
    off: lapsOff + validOff > 0 ? 1 : 0,
    bestOff: best !== null && listBest !== null && Math.abs(best - listBest) > 1 ? 1 : 0,
  }
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

/**
 * 02/11 (user: the bottom row as ACC Drive TELEMETRY): stint-level facts that do not change with the selected lap.
 * Air / track: the start of the stint (first stint = session start, later ones = the end of the previous stint)
 * and the change to the end of the stint (its last lap). Damage: the repair time at the end of the stint.
 * Pressure loss of the stint: the sum of the laps' losses per wheel (ACC Drive's "TOTAL LOSS" on hover).
 */
export function stintEndFacts(session: FullSession | null, stintNumber: number) {
  const stints = session?.stints ?? []
  const index = stints.findIndex(s => s.stint_number === stintNumber)
  const stint = index >= 0 ? stints[index] : undefined
  const laps = stint?.laps.filter(lap => lap.completeness !== 'missing') ?? []
  const previous = index > 0 ? stints[index - 1]?.laps.at(-1) : undefined
  const startAir = index === 0 ? recordedNumber(session?.session_info?.start_air_temp) : recordedNumber(previous?.air_temp) ?? recordedNumber(laps[0]?.air_temp)
  const startTrack = index === 0 ? recordedNumber(session?.session_info?.start_road_temp) : recordedNumber(previous?.road_temp) ?? recordedNumber(laps[0]?.road_temp)
  const last = laps.at(-1)
  const lossLaps = laps.map(lap => lap.telemetry?.pressure?.loss).filter((loss): loss is NonNullable<typeof loss> => Array.isArray(loss))
  const pressureLoss = [0, 1, 2, 3].map(i => {
    const values = lossLaps.map(loss => recordedNumber(loss[i]))
    return values.some(v => v !== null) ? values.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null
  })
  const damage = last?.telemetry?.damage
  return { startAir, startTrack, endAir: recordedNumber(last?.air_temp), endTrack: recordedNumber(last?.road_temp),
    damageBody: recordedNumber(damage?.body), damageSuspension: recordedNumber(damage?.suspension), pressureLoss }
}

export function lapStatus(lap: LapData): string {
  const { t } = useI18n()
  if (lap.completeness === 'missing') return t('data.status.lost')
  if (lap.is_valid == null || lap.validity === 'unknown') return t('data.status.unknown')
  return [lap.is_valid ? t('data.status.valid') : t('data.status.invalid'), lap.pit_out_lap ? t('data.status.pitOut') : lap.has_pit_stop ? t('data.status.pit') : '', lap.completeness === 'partial' ? t('sessions.common.partial') : ''].filter(Boolean).join(' · ')
}
