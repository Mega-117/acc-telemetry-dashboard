/** Game identity at the raw/persisted boundary. Unknown data never becomes ACC. */
export const RECORDING_SCHEMA = 'racercore.session'
export const RECORDING_VERSION = 1

export function isGameId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value)
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function recordingGame(raw: unknown): string | null {
  if (!record(raw)) return null
  if ('schema' in raw || 'game_id' in raw) {
    return raw.schema === RECORDING_SCHEMA && raw.version === RECORDING_VERSION && isGameId(raw.game_id)
      ? raw.game_id : null
  }
  const info = raw.session_info
  const staticData = raw.static_data
  if (!record(info) || !Array.isArray(raw.stints)) return null
  const summary = raw.summary
  const knownSummary = record(summary) && Number.isInteger(summary.best_rules_version)
    && Number(summary.best_rules_version) >= 1 && Number(summary.best_rules_version) <= 6
  return ['track', 'date_start', 'laps_total'].every(key => key in info)
    && ('car' in info || 'car_model' in info) && Number.isInteger(info.session_type)
    && ((record(staticData) && 'sectorCount' in staticData) || knownSummary) ? 'acc' : null
}

/** Existing SessionDocument metadata is a known ACC projection format. */
export function sessionGame(session: { meta?: { gameId?: string; track?: string; car?: string; date_start?: string; session_type?: number } }): string | null {
  const meta = session.meta
  if (!meta) return null
  if (meta.gameId !== undefined) return isGameId(meta.gameId) && meta.gameId !== 'unknown' ? meta.gameId : null
  return typeof meta.track === 'string' && typeof meta.car === 'string'
    && typeof meta.date_start === 'string' && typeof meta.session_type === 'number' ? 'acc' : null
}

export function gameScopedKey(gameId: string, ...parts: string[]): string {
  if (!isGameId(gameId)) throw new Error('invalid-game-identity')
  return JSON.stringify([gameId, ...parts])
}

export function canUseAccRules(raw: unknown): boolean {
  if (recordingGame(raw) !== 'acc' || !record(raw)) return false
  return raw.schema !== RECORDING_SCHEMA
    || (record(raw.capabilities) && raw.capabilities.acc_best_rules === true)
}
