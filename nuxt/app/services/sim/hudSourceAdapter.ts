import type { CommonLive } from '~/services/telemetry/commonLive'
import { commonValue } from '~/services/telemetry/commonLive'
import type { FastOverlayState } from '~/types/liveTelemetry'
import { resolveOptimalShiftRpm } from '~/config/optimalShiftRpm'
import { buildAccTrackMapScene, type AccStandingsCar } from './acc/accTrackMapScene'
import { buildCommonTrackMapScene } from './commonTrackMapScene'

/** Compatibility is confined to ingress. A new game's name never grants ACC rules. */
export function usesLegacyHudInput(live: CommonLive | null | undefined): boolean {
  return !live || live.gameId === 'acc'
}

export function hudSourcePolicy(state: Pick<FastOverlayState, 'commonLive' | 'context' | 'sectorHud'>) {
  const live = state.commonLive
  const legacy = usesLegacyHudInput(live)
  const declaredCount = live?.fields ? commonValue(live, 'sector_count', 'count') : null
  const count = state.sectorHud?.sectors.length ?? declaredCount
  return {
    compoundTyreBands: legacy,
    slipBands: legacy,
    shiftRpm: legacy ? resolveOptimalShiftRpm(state.context?.car) : live?.fields ? commonValue(live, 'optimal_shift_rpm', 'rpm') : null,
    cornerPlaceholder: legacy ? '0' : '—',
    explicitDeltaAvailability: !legacy,
    weatherForecast: legacy || live?.capabilities?.weather_forecast === true,
    sectorCount: count != null && Number.isInteger(count) && count > 0 && count <= 32 ? count : legacy ? 3 : 0,
    mapStartMarker: live?.capabilities?.map_start_marker === true,
    interpolateMap: live?.capabilities?.map_sample_interpolation === true,
  }
}

export function hudTrackMapScene(fast: FastOverlayState, snapshot: {
  cars?: AccStandingsCar[]; freshness?: { ttl_ms?: number }; session?: { focused_car_index?: number | null }
} | null, nowMs: number) {
  if (!usesLegacyHudInput(fast.commonLive)) return buildCommonTrackMapScene(fast.commonLive)
  return buildAccTrackMapScene({ cars: snapshot?.cars ?? [],
    focusedCarIndex: snapshot?.session?.focused_car_index ?? null,
    localCarIndex: fast.localDriver?.carIndex ?? null,
    localLapPosition: fast.isLive ? fast.normalizedCarPosition : null,
    sessionType: fast.sessionType, nowMs, ttlMs: snapshot?.freshness?.ttl_ms ?? null })
}
