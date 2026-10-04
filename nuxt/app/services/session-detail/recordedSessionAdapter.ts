import type { FullSession, LapData } from '~/types/telemetry'
import { canUseAccRules, recordingGame } from '~/services/telemetry/gameIdentity'
import { historyTrackId } from '~/services/projections/vehicleHistory'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN
const positive = (value: unknown) => finite(value) > 0 ? value as number : 0

/** Pure presentation adapter. NaN means absent in the legacy numeric UI model;
 * it is never persisted/exported, and renderers must show a dash for it.
 * Original source enums, validity and raw document remain unchanged.
 */
export function recordedSessionForDetail(raw: unknown): FullSession | null {
  if (canUseAccRules(raw)) return raw as FullSession
  if (recordingGame(raw) !== 'evo') return null
  const source = object(raw), info = object(source.session_info), capabilities = object(source.capabilities)
  const stints = (Array.isArray(source.stints) ? source.stints : []).map((value: unknown, index) => {
    const stint = object(value), fuel = finite(stint.fuel_start)
    const laps: LapData[] = (Array.isArray(stint.laps) ? stint.laps : []).map((value: unknown) => {
      const lap = object(value), duration = positive(lap.lap_time_ms)
      const sectors = Array.isArray(lap.sector_times_ms) ? lap.sector_times_ms : []
      const reliable = capabilities.sector_timing === true && sectors.length === 3
        && sectors.every(value => positive(value) > 0) && sectors.reduce((sum, value) => sum + Number(value), 0) === duration
      return { lap_number: positive(lap.lap_number), lap_time_ms: duration, elapsed_time_ms: 0,
        fuel_start: finite(lap.fuel_start), fuel_remaining: finite(lap.fuel_remaining),
        air_temp: finite(lap.air_temp), road_temp: finite(lap.road_temp),
        rain_intensity: text(lap.rain_intensity, '—'), track_grip_status: text(lap.track_grip_status, 'Unknown'),
        is_valid: lap.completeness === 'complete' && lap.validity === 'valid' && lap.is_valid === true,
        is_first_stint_lap: false, has_pit_stop: lap.has_pit_stop === true, pit_out_lap: lap.pit_out_lap === true,
        sectors_reliable: reliable, sector_times_ms: reliable ? sectors as number[] : [],
        completeness: text(lap.completeness), validity: text(lap.validity) }
    })
    const clean = laps.filter(lap => lap.is_valid && !lap.has_pit_stop && !lap.pit_out_lap)
    const best = Math.min(...clean.map(lap => lap.lap_time_ms))
    const trimmed = clean.filter(lap => lap.lap_time_ms <= best * 1.15)
    return { stint_number: positive(stint.stint_number) || index + 1,
      type: fuel > 0 ? fuel <= 20 ? 'Qualify' : 'Race' : 'Unknown', fuel_start: fuel,
      avg_clean_lap: trimmed.length >= 5 ? Math.round(trimmed.reduce((sum, lap) => sum + lap.lap_time_ms, 0) / trimmed.length) : 0,
      stint_drive_time_ms: laps.filter(lap => lap.completeness === 'complete').reduce((sum, lap) => sum + lap.lap_time_ms, 0), laps }
  })
  const laps = stints.flatMap(stint => stint.laps), valid = laps.filter(lap => lap.is_valid)
  return { schema: 'racercore.session', version: 1, game_id: 'evo', capabilities: source.capabilities as Record<string, boolean>,
    ownerId: text(source.ownerId), ownerEmail: text(source.ownerEmail), stints,
    session_info: { track: text(info.track), track_variant: text(info.track_variant), car: text(info.car), driver: text(info.driver),
      session_type: ({practice: 0, qualify: 1, race: 2} as Record<string, number>)[text(info.session_kind)] ?? -1,
      date_start: text(info.date_start), date_end: text(info.date_end), start_air_temp: finite(info.initial_air_temp),
      start_road_temp: finite(info.initial_road_temp), start_track_grip: 'Unknown', start_weather: '—',
      initial_track_grip_status: text(info.initial_track_grip_status),
      session_best_lap: valid.length ? Math.min(...valid.map(lap => lap.lap_time_ms)) : 0, avg_clean_lap: 0,
      total_drive_time_ms: stints.reduce((sum, stint) => sum + stint.stint_drive_time_ms, 0),
      laps_total: laps.length, laps_valid: valid.length, laps_invalid: laps.length - valid.length } }
}

export function sessionDetailTrackId(session: FullSession): string {
  return recordingGame(session) === 'evo'
    ? historyTrackId(session.session_info.track, session.session_info.track_variant)
    : session.session_info.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

export function formatRecordedNumber(value: number | undefined, suffix: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}${suffix}` : '—'
}

export function compatibleRecordedSession(primary: FullSession, candidate: FullSession): boolean {
  return recordingGame(primary) === recordingGame(candidate)
    && sessionDetailTrackId(primary) === sessionDetailTrackId(candidate)
}
