import { recordingGame } from './gameIdentity'
import { gameLabel } from './gameCatalog'
import { formatLapTime } from '~/utils/telemetryFormat'
import { commonSessionAnalysis } from './commonSessionAnalysis'
import { useI18n, type TranslationKey } from '~/i18n'

const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? formatLapTime(value) : '—'
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown, fallback = '') => typeof value === 'string' && value ? value : fallback

/** Display recorded facts only: no eligibility, sector synthesis or ACC rules. */
export function commonSessionPresentation(raw: unknown) {
  const gameId = recordingGame(raw)
  if (!gameId) return null
  const session = object(raw)
  if (session.schema !== 'racercore.session') return null
  const info = object(session.session_info)
  const { t } = useI18n()
  const label = (keys: Record<string, TranslationKey>, value: string, fallback: TranslationKey) => t(keys[value] ?? fallback)
  const laps = (Array.isArray(session.stints) ? session.stints : []).flatMap((value: unknown) => {
    const stint = object(value)
    return (Array.isArray(stint.laps) ? stint.laps : []).map((value: unknown) => {
      const lap = object(value)
      return {
      number: typeof lap.lap_number === 'number' ? lap.lap_number : '—',
      time: time(lap.lap_time_ms),
      completeness: label({ complete: 'sessions.common.complete', partial: 'sessions.common.partial', missing: 'sessions.common.missing' }, text(lap.completeness), 'sessions.common.unknownMasc'),
      validity: label({ valid: 'sessions.common.valid', invalid: 'sessions.common.invalid', unknown: 'sessions.common.unknownFem' }, text(lap.validity), 'sessions.common.unknownFem'),
      sectors: (Array.isArray(lap.sector_times_ms) ? lap.sector_times_ms : []).map(time),
      }
    })
  })
  const analysis = commonSessionAnalysis(raw)
  return { gameId, game: gameLabel(gameId), track: text(info.track, t('sessions.common.unknownTrack')), variant: text(info.track_variant), car: text(info.car, text(info.car_model, t('sessions.common.unknownCar'))), date: text(info.date_start), laps,
    analysis: analysis ? { ...analysis, best: time(analysis.bestMs), average: time(analysis.averageMs), theoretical: time(analysis.theoreticalMs), consistency: analysis.consistencyMs === null ? '—' : `${(analysis.consistencyMs / 1000).toFixed(3)} s` } : null }
}
