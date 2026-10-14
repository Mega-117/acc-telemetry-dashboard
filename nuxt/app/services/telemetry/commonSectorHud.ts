import type { SectorHudState } from '~/types/liveTelemetry'
import { commonBoolean, commonValue, type CommonLive } from './commonLive'

/** Connector declares cardinality and completed split facts; no three-sector assumption. */
export function commonSectorHud(live: CommonLive): SectorHudState | null {
  if (!live.connected || !live.fresh || live.capabilities.sector_timing !== true) return null
  const value = (name: string, unit = 'ms') => commonValue(live, name, unit)
  const count = value('sector_count', 'count')
  if (count === null || !Number.isInteger(count) || count < 1 || count > 32) return null
  const active = value('current_sector', 'index')
  const showingLast = commonBoolean(live, 'sector_last_lap') === true
  return { version: 1, mode: showingLast ? 'last_lap' : 'running', lap: value('lap_count', 'count'), referenceLap: null,
    currentSectorIndex: active, currentLapTimeMs: value('current_lap_time'), lastLapTimeMs: value('last_lap_time'),
    bestLapTimeMs: value('best_lap_time'), lapValid: commonBoolean(live, showingLast ? 'sector_lap_valid' : 'lap_valid'), awaitingFlyingLap: false,
    sectors: Array.from({ length: count }, (_, offset) => {
      const index = offset + 1
      const currentMs = value(`sector.${index}.time`)
      const referenceMs = value(`sector.${index}.reference`)
      // PIP-524: same rules as ACC: compare with the best valid sector,
      // purple = new best, green = equal, red = slower, invalid lap neutral.
      const bestReferenceMs = value(`sector.${index}.best_reference`)
      const deltaMs = currentMs !== null && bestReferenceMs !== null ? currentMs - bestReferenceMs : null
      const lapValid = commonBoolean(live, showingLast ? 'sector_lap_valid' : 'lap_valid') !== false
      return { index, state: currentMs !== null ? 'complete' : active === index ? 'running' : 'pending',
        currentMs, referenceMs, bestMs: value(`sector.${index}.best`), bestReferenceMs,
        deltaMs, color: currentMs === null ? 'grey' : !lapValid ? 'grey' : deltaMs === null ? 'white'
          : deltaMs < 0 ? 'purple' : deltaMs === 0 ? 'green' : 'red' }
    }),
  }
}
