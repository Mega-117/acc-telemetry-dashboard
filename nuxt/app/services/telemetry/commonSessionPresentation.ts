import { recordingGame } from './gameIdentity'
import { gameLabel } from './gameCatalog'
import { formatLapTime } from '~/utils/telemetryFormat'

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
  const laps = (Array.isArray(session.stints) ? session.stints : []).flatMap((value: unknown) => {
    const stint = object(value)
    return (Array.isArray(stint.laps) ? stint.laps : []).map((value: unknown) => {
      const lap = object(value)
      return {
      number: typeof lap.lap_number === 'number' ? lap.lap_number : '—',
      time: time(lap.lap_time_ms),
      completeness: ({ complete: 'Completo', partial: 'Parziale', missing: 'Dati mancanti' } as Record<string, string>)[text(lap.completeness)] || 'Sconosciuto',
      validity: ({ valid: 'Valido', invalid: 'Non valido', unknown: 'Sconosciuta' } as Record<string, string>)[text(lap.validity)] || 'Sconosciuta',
      sectors: (Array.isArray(lap.sector_times_ms) ? lap.sector_times_ms : []).map(time),
      }
    })
  })
  return { gameId, game: gameLabel(gameId), track: text(info.track, 'Pista sconosciuta'), car: text(info.car, text(info.car_model, 'Auto sconosciuta')), date: text(info.date_start), laps }
}
