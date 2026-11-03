import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useStandingsState } from '~/composables/useStandingsState'
import type { StandingsCarSnapshot, StandingsStateEnvelope } from '~/services/overlay/standingsPresentation'
import type { FastOverlayState } from '~/types/liveTelemetry'

/**
 * PIP-713 (coverage package B): the truth for a HUD's view on another car. The view is drawn from
 * the focused-car feed; the standings roster is a feed apart, written from the same UDP packets.
 * The car ACC's camera is on is the roster's `focused_car_index`; its values are compared only
 * when both feeds carry the same packet of that car (same realtime timestamp), so a feed a poll
 * behind is never a false KO. Which car is on screen is judged only once both the roster's camera
 * and the view have stayed on one car for a few seconds (Codex 03/11: the roster is throttled, the
 * focused feed is not, so right after a switch they name different cars).
 */
export interface SpectatorTruth {
  /** The roster's car the camera is on, or null. */
  car: StandingsCarSnapshot | null
  /** Both feeds carry the same UDP packet of the car on screen. */
  samePacket: boolean
  /** Camera and view have each stayed on one car long enough to judge which car is shown. */
  settled: boolean
}

export const SPECTATOR_CAMERA_SETTLE_MS = 3000

export function spectatorTruth(
  snapshot: StandingsStateEnvelope['snapshot'] | null | undefined,
  viewed: StandingsCarSnapshot | null | undefined,
  stableSinceMs: number,
  nowMs: number,
): SpectatorTruth {
  const focusIndex = snapshot?.session?.focused_car_index ?? null
  const car = snapshot?.cars.find(entry => entry.car_index === focusIndex) ?? null
  const samePacket = car !== null && !!viewed && car.car_index === viewed.car_index
    && typeof car.realtime_updated_at_ms === 'number' && car.realtime_updated_at_ms === viewed.realtime_updated_at_ms
  return { car, samePacket, settled: car !== null && !!viewed && nowMs - stableSinceMs >= SPECTATOR_CAMERA_SETTLE_MS }
}

/** The lap time the standings choose: the detailed one when valid, else the legacy one. */
export function rosterLapMs(detailed: unknown, legacy: unknown): number | null {
  if (typeof detailed === 'number' && detailed > 0 && detailed < 2147483647) return detailed
  return typeof legacy === 'number' ? legacy : null
}

/** A view kept on old data while the game runs: longer than the focused feed's TTL plus a poll. */
export const SPECTATOR_FROZEN_MS = 6000

interface SpectatorSource {
  fastState: Readonly<Ref<FastOverlayState>>
  focusedCar: Readonly<Ref<StandingsCarSnapshot | null>>
  localFastState: Readonly<Ref<FastOverlayState>>
}

export interface SpectatorReading extends SpectatorTruth {
  inputs: Record<string, unknown>
  shown: Record<string, string>
}

/**
 * The part every view on another car checks the same way: which car is on screen (once settled)
 * and whether the view is kept on old data while the game runs. `read()` answers null when there
 * is nothing to judge yet (feeds a moment apart), so the report retries on the next frame.
 */
export function useSpectatorCheck(getApi: Parameters<typeof useStandingsState>[0], source: SpectatorSource,
  roster: Pick<ReturnType<typeof useStandingsState>, 'state' | 'start' | 'stop'> = useStandingsState(getApi)) {
  const since = useCameraSince(() => roster.state.value.snapshot, () => source.focusedCar.value)
  let staleSince: number | null = null
  watch(source.fastState, (state) => {
    if (state.dataSource === 'focused' && !state.isFresh) staleSince ??= Date.now()
    else staleSince = null
  }, { immediate: true })
  onMounted(() => roster.start())
  onUnmounted(() => roster.stop())

  function read(nowMs = Date.now()): SpectatorReading | null {
    const viewed = source.focusedCar.value
    const truth = spectatorTruth(roster.state.value.snapshot, viewed, since.value, nowMs)
    const local = source.localFastState.value
    const staleMs = staleSince === null ? 0 : nowMs - staleSince
    const running = local.isFresh === true && local.isLive === true
    const wrongCar = truth.settled && truth.car !== null && !!viewed && viewed.car_index !== truth.car.car_index
    const frozen = running && staleMs > SPECTATOR_FROZEN_MS
    if (!truth.samePacket && !wrongCar && !frozen) return null
    const inputs: Record<string, unknown> = { specStaleMs: staleMs, specGameRunning: running }
    const shown: Record<string, string> = { specLive: frozen ? 'stale' : 'live' }
    if (truth.settled && truth.car && viewed) {
      inputs.specCar = truth.car.car_index
      shown.specCar = String(viewed.car_index)
    }
    return { ...truth, inputs, shown }
  }
  return { roster, read }
}

/** When the roster's camera or the car on screen last changed (wall clock). */
export function useCameraSince(
  snapshot: () => StandingsStateEnvelope['snapshot'] | null | undefined,
  viewed: () => StandingsCarSnapshot | null | undefined,
): Ref<number> {
  const since = ref(Date.now())
  let key: string | undefined
  watch(() => `${snapshot()?.session?.focused_car_index ?? '-'}/${viewed()?.car_index ?? '-'}`, (next) => {
    if (next !== key) { key = next; since.value = Date.now() }
  }, { immediate: true })
  return since
}
