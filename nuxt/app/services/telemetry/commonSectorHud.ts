import type { SectorHudState } from '~/types/liveTelemetry'
import { commonBoolean, commonValue, type CommonLive } from './commonLive'

/** Connector declares cardinality and completed split facts; no three-sector assumption. */
export function commonSectorHud(live: CommonLive): SectorHudState | null {
  if (!live.connected || !live.fresh || live.capabilities.sector_timing !== true) return null
  const value = (name: string, unit = 'ms') => commonValue(live, name, unit)
  const count = value('sector_count', 'count')
  if (count === null || !Number.isInteger(count) || count < 1 || count > 32) return null
  const active = value('current_sector', 'index')
  return { version: 1, mode: 'running', lap: value('lap_count', 'count'), referenceLap: null,
    currentSectorIndex: active, currentLapTimeMs: value('current_lap_time'), lastLapTimeMs: value('last_lap_time'),
    bestLapTimeMs: value('best_lap_time'), lapValid: commonBoolean(live, 'lap_valid'), awaitingFlyingLap: false,
    sectors: Array.from({ length: count }, (_, offset) => {
      const index = offset + 1
      const currentMs = value(`sector.${index}.time`)
      const referenceMs = value(`sector.${index}.reference`)
      const deltaMs = currentMs !== null && referenceMs !== null ? currentMs - referenceMs : null
      return { index, state: currentMs !== null ? 'complete' : active === index ? 'running' : 'pending',
        currentMs, referenceMs, bestMs: value(`sector.${index}.best`), bestReferenceMs: value(`sector.${index}.best_reference`),
        deltaMs, color: deltaMs === null ? 'grey' : deltaMs <= 0 ? 'green' : 'yellow' }
    }),
  }
}
