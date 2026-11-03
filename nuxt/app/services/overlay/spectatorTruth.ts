import { ref, watch, type Ref } from 'vue'
import type { StandingsCarSnapshot, StandingsStateEnvelope } from '~/services/overlay/standingsPresentation'

/**
 * PIP-713 (coverage package B): the truth for a HUD's view on another car. The view is drawn from
 * the focused-car feed; the standings roster is a feed apart, written from the same UDP packets.
 * The car ACC's camera is on is the roster's `focused_car_index`; its values are compared only
 * when both feeds carry the same packet of that car (same realtime timestamp), so a feed a poll
 * behind is never a false KO.
 */
export interface SpectatorTruth {
  /** The roster's car the camera is on, or null. */
  car: StandingsCarSnapshot | null
  /** Both feeds carry the same UDP packet of the car on screen. */
  samePacket: boolean
  /** The camera has stayed on this car long enough for both feeds to agree on it. */
  settled: boolean
}

export const SPECTATOR_CAMERA_SETTLE_MS = 3000

export function spectatorTruth(
  snapshot: StandingsStateEnvelope['snapshot'] | null | undefined,
  viewed: StandingsCarSnapshot | null | undefined,
  cameraSinceMs: number,
  nowMs: number,
): SpectatorTruth {
  const focusIndex = snapshot?.session?.focused_car_index ?? null
  const car = snapshot?.cars.find(entry => entry.car_index === focusIndex) ?? null
  const samePacket = car !== null && !!viewed && car.car_index === viewed.car_index
    && typeof car.realtime_updated_at_ms === 'number' && car.realtime_updated_at_ms === viewed.realtime_updated_at_ms
  return { car, samePacket, settled: car !== null && nowMs - cameraSinceMs >= SPECTATOR_CAMERA_SETTLE_MS }
}

/** The lap time the standings choose: the detailed one when valid, else the legacy one. */
export function rosterLapMs(detailed: unknown, legacy: unknown): number | null {
  if (typeof detailed === 'number' && detailed > 0 && detailed < 2147483647) return detailed
  return typeof legacy === 'number' ? legacy : null
}

/** When the roster's camera last moved to another car (wall clock). */
export function useCameraSince(snapshot: () => StandingsStateEnvelope['snapshot'] | null | undefined): Ref<number> {
  const since = ref(Date.now())
  let index: number | null | undefined
  watch(() => snapshot()?.session?.focused_car_index ?? null, (next) => {
    if (next !== index) { index = next; since.value = Date.now() }
  }, { immediate: true })
  return since
}
